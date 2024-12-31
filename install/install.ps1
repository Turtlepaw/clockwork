# Define the installation directory
$installDir = "~\Clockwork"
Write-Debug "Installation directory: $installDir"

# Check administrator privileges
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    # Elevate the script
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-File $PSCommandPath"
}

# Create the installation directory if it doesn't exist
if (-Not (Test-Path -Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir
}

# Set permissions for the installation directory
icacls $installDir /grant "Everyone:(OI)(CI)F" /T

# Download the latest release
$latestReleaseUrl = "https://github.com/Turtlepaw/clockwork/releases/latest/download/clockwork-win.exe"
$destinationPath = Join-Path -Path $installDir -ChildPath "clockwork.exe"
Invoke-WebRequest -Uri $latestReleaseUrl -OutFile $destinationPath

# Add the installation directory to the PATH environment variable
[System.Environment]::SetEnvironmentVariable("Path", $env:Path + ";$installDir", [System.EnvironmentVariableTarget]::Machine)

Write-Output "Clockwork has been installed successfully."
Write-Output "Restart your terminal to start using Clockwork."

# Press any key to exit
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")