param (
    [string]$installPath = "$env:USERPROFILE\Clockwork"
)

# Define the installation directory
$installDir = $installPath
Write-Debug "Installation directory: $installDir"

# Check administrator privileges
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Error "Script is not running as Administrator. Rerun the script with Administrator privileges."
    exit;
}


try {
    # Create the installation directory if it doesn't exist
    if (-Not (Test-Path -Path $installDir)) {
        Write-Host "Directory does not exist. Creating $installDir..."
        New-Item -ItemType Directory -Path $installDir
    } else {
        Write-Host "Directory already exists: $installDir"
    }

    # Set permissions for the installation directory
    Write-Host "Setting permissions for the directory..."
    icacls $installDir /grant "Everyone:(OI)(CI)F" /T

    # Download the latest release
    Write-Host "Downloading the latest release from GitHub..."
    $latestReleaseUrl = "https://github.com/Turtlepaw/clockwork/releases/latest/download/clockwork-win.exe"
    $destinationPath = Join-Path -Path $installDir -ChildPath "clockwork.exe"
    Invoke-WebRequest -Uri $latestReleaseUrl -OutFile $destinationPath

    # Add the installation directory to the PATH environment variable
    Write-Host "Adding installation directory to PATH..."
    [System.Environment]::SetEnvironmentVariable("Path", $env:Path + ";$installDir", [System.EnvironmentVariableTarget]::Machine)

    # Set CLOCKWORK_HOME
    Write-Host "Setting CLOCKWORK_HOME environment variable..."
    [System.Environment]::SetEnvironmentVariable("CLOCKWORK_HOME", $installDir, [System.EnvironmentVariableTarget]::Machine)

    Write-Output "Clockwork has been installed successfully."
    Write-Output "Restart your terminal to start using Clockwork."

} catch {
    Write-Error "An error occurred: $_"
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# Press any key to exit
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
