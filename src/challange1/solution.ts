// SecretMessageBox contract for accepting secret messages from authorised users.

export { SecretMessageBox, MAX_ADDRESS_COUNT, NO_MESSAGE, DUMMY_MESSAGE };

import {
  AccountUpdate,
  Bool,
  Field,
  MerkleMap,
  MerkleMapWitness,
  method,
  Permissions,
  Poseidon,
  Provable,
  PublicKey,
  SmartContract,
  state,
  State,
  UInt32,
} from 'o1js';

/** Maximum number of eligible addresses that can be stored. */
const MAX_ADDRESS_COUNT = 100;

/** A placeholder Field value denoting an address is not part of the merklemap. */
const NO_MESSAGE = Field(0);

/**
 * A non-valid message as a placeholder to initialize entries in the merklemap.
 * Using flag 1 and 2 as true which are at bit positions 249 and 250 respectively.
 */
const DUMMY_MESSAGE = Field((2n ** 249n) | (2n ** 250n));

/**
 * Smart contract for depositing secret messages from authorised users.
 */
class SecretMessageBox extends SmartContract {
  /**
   * A hash of the public key of the Administrator.
   * The address that deploys the contract is registered as the administrator.
   */
  @state(Field) admin = State<Field>();

  /** Root of the merkle map that stores all stored addresses and deposited messages. */
  @state(Field) mapRoot = State<Field>();

  /** A counter storing the number of all addresses stored */
  @state(UInt32) addressCount = State<UInt32>();

  /** A counter storing the number of all messages deposited */
  @state(UInt32) messageCount = State<UInt32>();

  // contract events
  events = {
    /** An event fired after a message is successfully deposited. */
    evtMessageReceived: UInt32,
  };

  // this is called automatically on contract deploy
  init() {
    super.init();

    // set permissions
    this.account.permissions.set({
      ...Permissions.default(),
      editState: Permissions.proofOrSignature(),
    });

    const messageBoxMap = new MerkleMap();
    const initialCommitment = messageBoxMap.getRoot();

    // initialize contract states
    this.admin.set(
      Poseidon.hash(this.sender.getAndRequireSignature().toFields())
    );
    this.mapRoot.set(initialCommitment);
    this.addressCount.set(UInt32.zero);
    this.messageCount.set(UInt32.zero);
  }

  /** A function to store eligible addresses */
  @method
  async storeAddress(address: PublicKey, witness: MerkleMapWitness) {
    // preconditions
    const admin = this.admin.getAndRequireEquals();
    const mapRoot = this.mapRoot.getAndRequireEquals();
    const addressCount = this.addressCount.getAndRequireEquals();

    // make sure this update is authorized with a signature
    const sender = this.sender.getAndRequireSignature();

    // check that the signer is the admin
    admin.assertEquals(Poseidon.hash(sender.toFields()));

    // confirm that the address is NOT in the merkle map
    const key = Poseidon.hash(address.toFields());
    const [computedRoot, computedKey] = witness.computeRootAndKeyV2(NO_MESSAGE);
    computedKey.assertEquals(key);
    computedRoot.assertEquals(mapRoot, 'Address already registered.');

    // check the limit of allowed addresses
    addressCount.assertLessThan(
      UInt32.from(MAX_ADDRESS_COUNT),
      'Eligible address storage limit reached.'
    );

    // store the address
    const [newRoot] = witness.computeRootAndKeyV2(DUMMY_MESSAGE);
    this.mapRoot.set(newRoot);

    // increment number of stored addresses
    this.addressCount.set(addressCount.add(UInt32.one));
  }

  /** A function to validate and store messages */
  @method
  async depositMessage(message: Field, witness: MerkleMapWitness) {
    // preconditions
    const mapRoot = this.mapRoot.getAndRequireEquals();
    const messageCount = this.messageCount.getAndRequireEquals();

    // make sure this update is authorized with a signature
    const sender = this.sender.getAndRequireSignature();

    const key = Poseidon.hash(sender.toFields());

    // confirm that the address is in the merkle map and has no message yet
    const [computedRoot, computedKey] =
      witness.computeRootAndKeyV2(DUMMY_MESSAGE);
    computedKey.assertEquals(key);
    computedRoot.assertEquals(
      mapRoot,
      'Address is either not eligible or message already sent.'
    );

    // confirm message is provided
    message.assertNotEquals(NO_MESSAGE);

    // reject dummy message used as placeholder
    message.assertNotEquals(DUMMY_MESSAGE);

    const [flag6, flag5, flag4, flag3, flag2, flag1] = message
      .toBits()
      .reverse();

    // if flag 1 is true, then all other flags must be false.
    Provable.if(
      flag1,
      flag2.or(flag3).or(flag4).or(flag5).or(flag6),
      Bool(false)
    ).assertFalse();

    // if flag 2 is true, then flag 3 must also be true.
    Provable.if(flag2, flag3, Bool(true)).assertTrue();

    // if flag 4 is true, then flags 5 and 6 must be false.
    Provable.if(flag4, flag5.or(flag6), Bool(false)).assertFalse();

    // store the message
    const [newRoot] = witness.computeRootAndKeyV2(message);
    this.mapRoot.set(newRoot);

    // increment number of stored messages
    this.messageCount.set(messageCount.add(UInt32.one));

    // emit message received event
    this.emitEvent('evtMessageReceived', messageCount);
  }
}
