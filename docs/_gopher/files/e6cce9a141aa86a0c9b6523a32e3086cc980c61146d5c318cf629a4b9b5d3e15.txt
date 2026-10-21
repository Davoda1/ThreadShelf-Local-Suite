# Server integration: check and apply

Run the following commands from the extracted **ThreadShelf-Local-Suite** source root. Replace `../ThreadShelf` with your own supported server source directory. The path is an example, not an existing user-specific directory.

## 1. Read-only compatibility check

```sh
node server-patch/manage.mjs check ../ThreadShelf
```

Read the result. A supported unpatched state is eligible for installation. An already-applied state needs no second patch. A mismatch means that the current files are not one of the recognized states; resolve that mismatch before proceeding.

Do not bypass a mismatch by editing the expected hashes or renaming another server version to 1.3.0. Obtain the correct upstream baseline or preserve and reconcile local source changes deliberately.

## 2. Preview installation

```sh
node server-patch/manage.mjs install ../ThreadShelf --dry-run
```

The dry run checks the intended operation without installing the changes. Use it to confirm that you selected the correct directory and that the supported source state is recognized.

## 3. Stop the server and install

Stop the server using the normal launch/service controls. Confirm the relevant process has exited. Then run:

```sh
node server-patch/manage.mjs install ../ThreadShelf
```

The patcher validates the target files, creates a backup and installs only the integration changes. The backup directory is `.threadshelf-local-suite-backup-v1` inside the target source tree. Keep that backup intact while the patch is installed.

Run the check command again after installation to verify the recognized installed state. Repeating installation should identify the already-applied state rather than duplicating source edits.

## 4. Build and start the server

For a fresh source checkout, install the pinned upstream dependencies and build the server’s web client:

```sh
cd ../ThreadShelf
npm ci
npm run build:client
npm start
```

For an existing checkout with correctly installed dependencies, an unnecessary reinstall is not part of patch application. Use the upstream project’s documented commands and your established environment configuration.

The source server uses the TypeScript startup path. If your deployment runs compiled output, run `npm run build` after applying the patch and restart the existing compiled launch path. Editing source without rebuilding a compiled deployment leaves the old running behavior in place.

For a container deployment, patch the source build context and rebuild/recreate the service while preserving the service’s environment, data volumes, mounts and port mappings. Do not start a second server on the same port.

## 5. Verify the live service

Proceed to [verification and client connection](03-Verify-and-Connect.md). A successful file patch does not itself prove that the running process is the patched source tree. Check the live capability response and a representative search.

## Windows command use

The Node commands above also work from PowerShell or Command Prompt when Node is installed. Quote your directory argument, for example `"C:\Projects\ThreadShelf"`. Stop a Windows service through the control method you normally use; the patcher does not choose or manage a service for you.
