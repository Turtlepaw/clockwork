# Define the installation directory
$installDir = "C:\Program Files\Clockwork"

# Create the installation directory if it doesn't exist
if (-Not (Test-Path -Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir
}

# Download the latest release
$latestReleaseUrl = "https://github.com/Turtlepaw/clockwork/releases/latest/download/clockwork-win.exe"
$destinationPath = Join-Path -Path $installDir -ChildPath "clockwork.exe"
Invoke-WebRequest -Uri $latestReleaseUrl -OutFile $destinationPath

# Add the installation directory to the PATH environment variable
[System.Environment]::SetEnvironmentVariable("Path", $env:Path + ";$installDir", [System.EnvironmentVariableTarget]::Machine)

Write-Output "Clockwork has been installed successfully."
Write-Output "Restart your terminal to start using Clockwork."