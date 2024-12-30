#!/bin/bash

# Define the installation directory
installDir="/usr/local/bin"

# Download the latest release
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    latestReleaseUrl="https://github.com/Turtlepaw/clockwork/releases/latest/download/clockwork-linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    latestReleaseUrl="https://github.com/Turtlepaw/clockwork/releases/latest/download/clockwork-macos"
else
    echo "Unsupported OS type: $OSTYPE"
    exit 1
fi

destinationPath="$installDir/clockwork"
curl -L $latestReleaseUrl -o $destinationPath

# Make the file executable
chmod +x $destinationPath

# Add the installation directory to the PATH environment variable
if ! echo "$PATH" | grep -q "$installDir"; then
    echo "export PATH=\$PATH:$installDir" >> ~/.bashrc
    source ~/.bashrc
fi

echo "Clockwork has been installed successfully."
echo "Restart your terminal to start using Clockwork."