/* eslint-disable no-useless-catch */
//SOLUTION BASED ON https://github.com/t4top/mina-learn-to-earn/tree/main/challenge_1

import {
  AccountUpdate,
  Bool,
  Cache,
  Field,
  MerkleMap,
  Mina,
  Poseidon,
  PrivateKey,
  UInt32,
} from 'o1js';
import {
  SecretMessageBox,
  MAX_ADDRESS_COUNT,
  NO_MESSAGE,
  DUMMY_MESSAGE,
} from './solution.js';

/**
 * This merkle map serves as the tree tracking the off-chain storage
 * It stores eligible addresses mapped to messages, i.e.
 *   [ hash(address) -> message ]
 */
const messageBoxMap = new MerkleMap();

let zkApp: SecretMessageBox;

const MAX_FLAGS_SIZE = 6;

// ------------------
// Test Functions
// ------------------

describe('Challenge 1: Secret Message Box', () => {
  let admin: Mina.TestPublicKey, testAccounts: Mina.TestPublicKey[];
  beforeAll(async () => {
    const proofsEnabled = false;
    const Local = await Mina.LocalBlockchain({ proofsEnabled });
    Mina.setActiveInstance(Local);
    [admin] = testAccounts = Local.testAccounts;

    const zkAppPrivateKey = PrivateKey.random();
    const zkAppAddress = zkAppPrivateKey.toPublicKey();
    zkApp = new SecretMessageBox(zkAppAddress);

    // Administrator user account

    const cacheDir = 'build/cache';
    if (proofsEnabled)
      await SecretMessageBox.compile({ cache: Cache.FileSystem(cacheDir) });

    const tx = await Mina.transaction(admin, async () => {
      AccountUpdate.fundNewAccount(admin);
      await zkApp.deploy();
    });
    await tx.prove();
    await tx.sign([zkAppPrivateKey, admin.key]).send();

    const onChainAdmin = zkApp.admin.get();
    const onChainMapRoot = zkApp.mapRoot.get();
    const onChainAddressCount = zkApp.addressCount.get();
    const onChainMessageCount = zkApp.messageCount.get();

    expect(onChainAdmin).toEqual(Poseidon.hash(admin.toFields()));
    expect(onChainMapRoot).toEqual(messageBoxMap.getRoot());
    expect(onChainAddressCount).toEqual(UInt32.zero);
    expect(onChainMessageCount).toEqual(UInt32.zero);
  });

  describe('Function 1: storeAddress', () => {
    it('should allow storing an address by the admininistrator', async () => {
      await storeUserAddress({ sender: admin, user: testAccounts[1] });

      const onChainMapRoot = zkApp.mapRoot.get();
      const onChainAddressCount = zkApp.addressCount.get();

      expect(onChainMapRoot).toEqual(messageBoxMap.getRoot());
      expect(onChainAddressCount).toEqual(UInt32.one);
    });

    it('should not allow storing of the same address multiple times', async () => {
      await expect(
        storeUserAddress({ sender: admin, user: testAccounts[1] })
      ).rejects.toThrow();
    });

    it('should reject storing of address by a non-admin user', async () => {
      await expect(
        storeUserAddress({ sender: testAccounts[1], user: testAccounts[2] })
      ).rejects.toThrow();
    });

    it(`should allow the administrator to store up to ${MAX_ADDRESS_COUNT} addresses`, async () => {
      // i starts from 2 because testAccounts[1] is already stored above
      for (let i = 2; i <= MAX_ADDRESS_COUNT; i++) {
        await storeUserAddress({
          sender: admin,
          user: i > 9 ? Mina.TestPublicKey.random() : testAccounts[i],
        });
      }

      const onChainMapRoot = zkApp.mapRoot.get();
      const onChainAddressCount = zkApp.addressCount.get();

      expect(onChainMapRoot).toEqual(messageBoxMap.getRoot());
      expect(onChainAddressCount).toEqual(new UInt32(MAX_ADDRESS_COUNT));
    });

    it(`should reject storing more than ${MAX_ADDRESS_COUNT} addresses`, async () => {
      await expect(
        storeUserAddress({ sender: admin, user: Mina.TestPublicKey.random() })
      ).rejects.toThrow();
    });
  });

  describe('Function 2: depositMessage', () => {
    it('should allow an eligible user to deposit a valid message (1)', async () => {
      const message = generateMessageFromFlags({ flag1: true }); // other flags are false by default
      await depositUserMessage({ sender: testAccounts[1], message });

      const onChainMapRoot = zkApp.mapRoot.get();
      expect(onChainMapRoot).toEqual(messageBoxMap.getRoot());
    });

    it('should allow an eligible user to deposit a valid message (2)', async () => {
      const message = generateMessageFromFlags({ flag2: true, flag3: true });
      await depositUserMessage({ sender: testAccounts[2], message });

      const onChainMapRoot = zkApp.mapRoot.get();
      expect(onChainMapRoot).toEqual(messageBoxMap.getRoot());
    });

    it('should allow an eligible user to deposit a valid message (3)', async () => {
      const message = generateMessageFromFlags({
        flag4: true,
        flag5: false,
        flag6: false,
      });
      await depositUserMessage({ sender: testAccounts[3], message });

      const onChainMapRoot = zkApp.mapRoot.get();
      expect(onChainMapRoot).toEqual(messageBoxMap.getRoot());
    });

    it('should confirm a counter of messages received is updated', async () => {
      const onChainMessageCount = zkApp.messageCount.get();
      expect(onChainMessageCount).toEqual(new UInt32(3));
    });

    it('should confirm an event is emitted after successful message deposit', async () => {
      const events = await zkApp.fetchEvents();
      // assert.ok(events.length > 0);
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toEqual('evtMessageReceived');
    });

    it('should reject depositing messages multiple times by the same user', async () => {
      const message = generateMessageFromFlags({ flag1: true });
      await expect(
        depositUserMessage({ sender: testAccounts[1], message })
      ).rejects.toThrow();
    });

    it('should not allow a non-eligible user to deposit a message', async () => {
      const message = generateMessageFromFlags({ flag1: true });
      const nonEligibleUser = Mina.TestPublicKey.random();
      await expect(
        depositUserMessage({ sender: nonEligibleUser, message })
      ).rejects.toThrow();
    });

    it('should reject depositing a non-valid message (1)', async () => {
      await expect(
        depositUserMessage({ sender: testAccounts[4], message: NO_MESSAGE })
      ).rejects.toThrow();
    });

    it('should reject depositing a non-valid message (2)', async () => {
      await expect(
        depositUserMessage({ sender: testAccounts[4], message: DUMMY_MESSAGE })
      ).rejects.toThrow();
    });

    it('should reject depositing a non-valid message (3)', async () => {
      const notValidMessage = generateMessageFromFlags({
        flag1: true,
        flag3: true,
      });
      await expect(
        depositUserMessage({
          sender: testAccounts[4],
          message: notValidMessage,
        })
      ).rejects.toThrow();
    });

    it('should reject depositing a non-valid message (4)', async () => {
      const notValidMessage = generateMessageFromFlags({
        flag2: true,
        flag3: false,
      });
      await expect(
        depositUserMessage({
          sender: testAccounts[4],
          message: notValidMessage,
        })
      ).rejects.toThrow();
    });

    it('should reject depositing a non-valid message (5)', async () => {
      const notValidMessage = generateMessageFromFlags({
        flag4: true,
        flag5: true,
      });
      await expect(
        depositUserMessage({
          sender: testAccounts[4],
          message: notValidMessage,
        })
      ).rejects.toThrow();
    });
  });
  const storeUserAddress = async ({
    sender,
    user,
  }: {
    sender: Mina.TestPublicKey;
    user: Mina.TestPublicKey;
  }) => {
    try {
      const userHash = Poseidon.hash(user.toFields());

      // Create the transaction
      const tx = await Mina.transaction(sender, async () => {
        const witness = messageBoxMap.getWitness(userHash);
        await zkApp.storeAddress(user, witness);
      });

      // Prove and sign the transaction
      await tx.prove();
      await tx.sign([sender.key]).send();

      // Update off-chain storage if the transaction is successful
      messageBoxMap.set(userHash, DUMMY_MESSAGE);
    } catch (error) {
      throw error; // Re-throw the error to be caught by Jest in the test
    }
  };

  const depositUserMessage = async ({
    sender,
    message,
  }: {
    sender: Mina.TestPublicKey;
    message: Field;
  }) => {
    try {
      const userHash = Poseidon.hash(sender.toFields());

      // Create the transaction
      const tx = await Mina.transaction(sender, async () => {
        const witness = messageBoxMap.getWitness(userHash);
        await zkApp.depositMessage(message, witness);
      });

      // Prove and sign the transaction
      await tx.prove();
      await tx.sign([sender.key]).send();

      // Update off-chain storage as well
      messageBoxMap.set(userHash, message);
    } catch (error) {
      throw error; // Re-throw the error to be caught by Jest in the test
    }
  };

  function generateMessageFromFlags({
    flag1 = false,
    flag2 = false,
    flag3 = false,
    flag4 = false,
    flag5 = false,
    flag6 = false,
  }): Field {
    let msg = Field(0).toBits();
    const len = msg.length;
    msg[len - MAX_FLAGS_SIZE + 0] = Bool(flag1);
    msg[len - MAX_FLAGS_SIZE + 1] = Bool(flag2);
    msg[len - MAX_FLAGS_SIZE + 2] = Bool(flag3);
    msg[len - MAX_FLAGS_SIZE + 3] = Bool(flag4);
    msg[len - MAX_FLAGS_SIZE + 4] = Bool(flag5);
    msg[len - MAX_FLAGS_SIZE + 5] = Bool(flag6);
    return Field.fromBits(msg);
  }
});
