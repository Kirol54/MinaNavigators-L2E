# Mina Navigators L2E Challanges Season 1

Welcome to the **Mina Navigators L2E Challanges** repository! This project contains essential code and resources. Additionally, there are optional PDF files that you can choose to include when cloning the repository.

## Cloning the Repository

### Option 1: Clone Without PDFs (Default)

By default, the session notes PDF files will not be included when you clone the repository. This is the simplest and fastest way to get started.

To clone without the PDFs, simply run:

```bash
git clone <repository-url>
cd <repository-directory>
```

### Option 2: Clone With PDFs

If you need the optional PDF files, you can clone the repository and initialize the submodule that contains the PDFs.

1. **Clone the repository:**

   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```

2. **Initialize and update the submodule to download the PDFs:**

   ```bash
   git submodule update --init --recursive
   ```

   This command will download the PDF files stored in the `session_notes` directory.

## Contributing

If you’d like to contribute, feel free to fork the repository and submit a pull request. Contributions are welcome!

## License

This project is licensed under the [Apache-2.0](LICENSE). See the `LICENSE` file for details.

## How to build

```sh
npm run build
```

## How to run tests

```sh
npm run test
npm run testw # watch mode
```

## How to run coverage

```sh
npm run coverage
```
