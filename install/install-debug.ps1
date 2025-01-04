param (
    [string]$installPath = "$env:USERPROFILE\Clockwork"
)

# Start logging to a transcript file for debugging purposes
Start-Transcript -Path "$env:TEMP\ClockworkInstall.log" -Append

# Define the installation directory
$installDir = $installPath
Write-Debug "Installation directory: $installDir"

# Check administrator privileges
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Error "Script is not running as Administrator. Rerun the script with Administrator privileges."
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    Stop-Transcript
    exit
}

try {
    # Create the installation directory if it doesn't exist
    if (-Not (Test-Path -Path $installDir)) {
        Write-Host "Directory does not exist. Creating $installDir..."
        New-Item -ItemType Directory -Path $installDir -Force
    } else {
        Write-Host "Directory already exists: $installDir"
    }

    # Set permissions for the installation directory
    Write-Host "Setting permissions for the directory..."
    $icaclsOutput = icacls $installDir /grant "Everyone:(OI)(CI)F" /T
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to set permissions. Ensure you have the required privileges."
        Write-Host "Press any key to exit..."
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        Stop-Transcript
        exit 1
    }

    # Download the latest release
    Write-Host "Downloading the latest release from GitHub..."
    $latestReleaseUrl = "https://github.com/Turtlepaw/clockwork/releases/latest/download/clockwork-win.exe"
    $destinationPath = Join-Path -Path $installDir -ChildPath "clockwork.exe"
    try {
        $response = Invoke-WebRequest -Uri $latestReleaseUrl -OutFile $destinationPath -ErrorAction Stop
        Write-Host "Download completed successfully: $($response.StatusDescription)"
    } catch {
        Write-Error "Failed to download file: $($_.Exception.Message)"
        Write-Debug $_.Exception.StackTrace
        Write-Host "Press any key to exit..."
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        Stop-Transcript
        exit 1
    }

    # Add the installation directory to the PATH environment variable
    Write-Host "Adding installation directory to PATH..."
    try {
        [System.Environment]::SetEnvironmentVariable("Path", $env:Path + ";$installDir", [System.EnvironmentVariableTarget]::Machine)
    } catch {
        Write-Error "Failed to update PATH environment variable: $($_.Exception.Message)"
        Write-Debug $_.Exception.StackTrace
        Write-Host "Press any key to exit..."
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        Stop-Transcript
        exit 1
    }

    # Set CLOCKWORK_HOME environment variable
    Write-Host "Setting CLOCKWORK_HOME environment variable..."
    try {
        [System.Environment]::SetEnvironmentVariable("CLOCKWORK_HOME", $installDir, [System.EnvironmentVariableTarget]::Machine)
    } catch {
        Write-Error "Failed to set CLOCKWORK_HOME environment variable: $($_.Exception.Message)"
        Write-Debug $_.Exception.StackTrace
        Write-Host "Press any key to exit..."
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        Stop-Transcript
        exit 1
    }

    Write-Output "Clockwork has been installed successfully."
    Write-Output "Restart your terminal to start using Clockwork."

} catch {
    Write-Error "An unexpected error occurred: $_"
    Write-Debug $_.Exception.StackTrace
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    Stop-Transcript
    exit 1
}

# Ensure the terminal doesn't close abruptly
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Stop logging
Stop-Transcript
