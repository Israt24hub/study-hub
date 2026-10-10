<#
.SYNOPSIS
Lock (encrypt) teachers' slides so the Study Hub site shows them only after the password is entered.

.DESCRIPTION
The slides are encrypted with one random master key (AES-256-CBC + HMAC-SHA256) and stored in slides/ as
<random id>.bin, with an encrypted list of titles in slides/index.enc. The master key itself is stored in
slides/key.json, wrapped with a key derived from your password (PBKDF2-SHA256), so the public repo only ever
holds locked data. The website unlocks everything in the browser with the same password.

  1. Lock new slides:   .\tools\lock_slides.ps1 -Encrypt -Source "E:\nsu academic\study-hub-slides"
                        (Source holds "<CODE - Course name>\Slides\<file>"; files already locked are skipped)
  2. Set the password:  .\tools\lock_slides.ps1 -SetPassword
  3. Later, to add more slides, get the key back first:
                        .\tools\lock_slides.ps1 -Unlock      then run step 1 again, then step 2.

The master key is kept in -KeyFile (default: .study-hub-slides.key in your user folder) only between these steps;
-SetPassword deletes it unless -KeepKey is given.
#>
[CmdletBinding()]
param(
    [switch]$Encrypt,
    [switch]$SetPassword,
    [switch]$Unlock,
    [string]$Source,
    [string]$KeyFile = (Join-Path $env:USERPROFILE ".study-hub-slides.key"),
    [SecureString]$Password,
    [switch]$KeepKey
)

$ErrorActionPreference = "Stop"
$Repo = Split-Path $PSScriptRoot -Parent
$Out = Join-Path $Repo "slides"
$KeyJson = Join-Path $Out "key.json"
$IndexFile = Join-Path $Out "index.enc"
$Iterations = 600000
$Utf8 = New-Object System.Text.UTF8Encoding $false

Add-Type -TypeDefinition @'
using System;
using System.Security.Cryptography;

public static class SlideCrypto {
    static readonly byte[] Magic = { 0x53, 0x48, 0x42, 0x31 };  // "SHB1"

    public static byte[] RandomBytes(int n) {
        var b = new byte[n];
        using (var r = RandomNumberGenerator.Create()) r.GetBytes(b);
        return b;
    }

    static byte[] Half(byte[] key, int offset) {
        var b = new byte[32];
        Buffer.BlockCopy(key, offset, b, 0, 32);
        return b;
    }

    // magic | iv | AES-256-CBC(plain) | HMAC-SHA256(magic | iv | ciphertext)
    public static byte[] Seal(byte[] key, byte[] plain) {
        var iv = RandomBytes(16);
        byte[] ct;
        using (var aes = Aes.Create()) {
            aes.Key = Half(key, 0); aes.IV = iv; aes.Mode = CipherMode.CBC; aes.Padding = PaddingMode.PKCS7;
            using (var enc = aes.CreateEncryptor()) ct = enc.TransformFinalBlock(plain, 0, plain.Length);
        }
        var blob = new byte[20 + ct.Length + 32];
        Buffer.BlockCopy(Magic, 0, blob, 0, 4);
        Buffer.BlockCopy(iv, 0, blob, 4, 16);
        Buffer.BlockCopy(ct, 0, blob, 20, ct.Length);
        using (var h = new HMACSHA256(Half(key, 32))) {
            var tag = h.ComputeHash(blob, 0, 20 + ct.Length);
            Buffer.BlockCopy(tag, 0, blob, 20 + ct.Length, 32);
        }
        return blob;
    }

    public static byte[] Open(byte[] key, byte[] blob) {
        if (blob.Length < 68) throw new CryptographicException("File is too short.");
        for (int i = 0; i < 4; i++) if (blob[i] != Magic[i]) throw new CryptographicException("Not a locked Study Hub file.");
        int ctLen = blob.Length - 52;
        byte[] tag;
        using (var h = new HMACSHA256(Half(key, 32))) tag = h.ComputeHash(blob, 0, 20 + ctLen);
        int diff = 0;
        for (int i = 0; i < 32; i++) diff |= tag[i] ^ blob[20 + ctLen + i];
        if (diff != 0) throw new CryptographicException("Wrong password/key, or the file is damaged.");
        var iv = new byte[16];
        Buffer.BlockCopy(blob, 4, iv, 0, 16);
        using (var aes = Aes.Create()) {
            aes.Key = Half(key, 0); aes.IV = iv; aes.Mode = CipherMode.CBC; aes.Padding = PaddingMode.PKCS7;
            using (var dec = aes.CreateDecryptor()) return dec.TransformFinalBlock(blob, 20, ctLen);
        }
    }

    public static byte[] Kdf(string password, byte[] salt, int iterations) {
        using (var d = new Rfc2898DeriveBytes(password, salt, iterations, HashAlgorithmName.SHA256)) return d.GetBytes(64);
    }
}
'@

function Read-Plain([SecureString]$secure) {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Get-Password([bool]$Confirm) {
    if ($Password) { return Read-Plain $Password }
    while ($true) {
        $first = Read-Plain (Read-Host "Password" -AsSecureString)
        if (-not $Confirm) { return $first }
        if ($first.Length -lt 8) { Write-Host "Use at least 8 characters." -ForegroundColor Yellow; continue }
        $second = Read-Plain (Read-Host "Type it again" -AsSecureString)
        if ($first -ceq $second) { return $first }
        Write-Host "The two passwords didn't match. Try again." -ForegroundColor Yellow
    }
}

function Get-MasterKey {
    if (-not (Test-Path -LiteralPath $KeyFile)) { throw "No key file at $KeyFile. Run with -Unlock first." }
    return [Convert]::FromBase64String((Get-Content -LiteralPath $KeyFile -Raw).Trim())
}

function Save-MasterKey([byte[]]$key) {
    [IO.File]::WriteAllText($KeyFile, [Convert]::ToBase64String($key), $Utf8)
}

function Title-From([string]$name) {
    $stem = [IO.Path]::GetFileNameWithoutExtension($name)
    return (($stem -replace '_+', ' ') -replace '\s+', ' ').Trim()
}

if (-not ($Encrypt -or $SetPassword -or $Unlock)) { Get-Help $PSCommandPath -Detailed; exit 1 }

if ($Unlock) {
    if (-not (Test-Path -LiteralPath $KeyJson)) { throw "There is no $KeyJson yet." }
    $k = Get-Content -LiteralPath $KeyJson -Raw | ConvertFrom-Json
    $pw = Get-Password $false
    $kek = [SlideCrypto]::Kdf($pw, [Convert]::FromBase64String($k.salt), [int]$k.iterations)
    try { $master = [SlideCrypto]::Open($kek, [Convert]::FromBase64String($k.wrapped)) }
    catch { throw "That password isn't right." }
    Save-MasterKey $master
    Write-Host "Key saved to $KeyFile. Now run -Encrypt, then -SetPassword." -ForegroundColor Green
}

if ($Encrypt) {
    if (-not $Source -or -not (Test-Path -LiteralPath $Source)) { throw "Give -Source, the folder with <CODE - Course name>\Slides\ inside." }
    New-Item -ItemType Directory -Force -Path $Out | Out-Null
    if (Test-Path -LiteralPath $KeyFile) {
        $master = Get-MasterKey
    } elseif (Test-Path -LiteralPath $IndexFile) {
        throw "Slides are already locked. Run with -Unlock first to get the key back."
    } else {
        $master = [SlideCrypto]::RandomBytes(64)
        Save-MasterKey $master
    }

    $entries = New-Object System.Collections.ArrayList
    $courses = @{}
    if (Test-Path -LiteralPath $IndexFile) {
        $old = [Text.Encoding]::UTF8.GetString([SlideCrypto]::Open($master, [IO.File]::ReadAllBytes($IndexFile))) | ConvertFrom-Json
        foreach ($e in $old.slides) { [void]$entries.Add($e) }
        foreach ($p in $old.courses.PSObject.Properties) { $courses[$p.Name] = @{ semester = $p.Value.semester } }
    }
    $have = @{}
    foreach ($e in $entries) { $have[$e.src] = $true }

    $semesters = @{}
    $semFile = Join-Path $Source "_semesters.csv"
    if (Test-Path -LiteralPath $semFile) { Import-Csv -LiteralPath $semFile | ForEach-Object { $semesters[$_.folder] = $_.semester } }

    $root = (Resolve-Path -LiteralPath $Source).Path.TrimEnd('\') + '\'
    $files = Get-ChildItem -LiteralPath $Source -Recurse -File | Where-Object { $_.Name -ne "desktop.ini" -and $_.Name -ne "Thumbs.db" }
    $added = 0
    $now = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    foreach ($f in $files) {
        $rel = $f.FullName.Substring($root.Length).Replace('\', '/')
        $parts = $rel.Split('/')
        if ($parts.Count -lt 2 -or $have.ContainsKey($rel)) { continue }
        $course = $parts[0]
        $id = -join ([SlideCrypto]::RandomBytes(16) | ForEach-Object { $_.ToString("x2") })
        $sealed = [SlideCrypto]::Seal($master, [IO.File]::ReadAllBytes($f.FullName))
        [IO.File]::WriteAllBytes((Join-Path $Out "$id.bin"), $sealed)
        [void]$entries.Add([ordered]@{
            src = $rel; course = $course; title = (Title-From $f.Name); name = $f.Name
            ext = $f.Extension.TrimStart('.').ToLower(); size = $f.Length; id = $id; added = $now
        })
        if (-not $courses.ContainsKey($course)) { $courses[$course] = @{ semester = "" } }
        if ($semesters.ContainsKey($course)) { $courses[$course].semester = $semesters[$course] }
        $added++
        if ($added % 25 -eq 0) { Write-Host "  locked $added files..." }
    }
    $index = [ordered]@{ v = 1; courses = $courses; slides = @($entries) }
    $json = $index | ConvertTo-Json -Depth 6 -Compress
    [IO.File]::WriteAllBytes($IndexFile, [SlideCrypto]::Seal($master, $Utf8.GetBytes($json)))
    Write-Host "Locked $added new files ($($entries.Count) in total). Next: run with -SetPassword." -ForegroundColor Green
}

if ($SetPassword) {
    $master = Get-MasterKey
    if (Test-Path -LiteralPath $IndexFile) { [void][SlideCrypto]::Open($master, [IO.File]::ReadAllBytes($IndexFile)) }
    Write-Host "Choose the password people will type on the website to see the slides."
    Write-Host "Use one you don't use anywhere else - you'll be sharing it with classmates."
    $pw = Get-Password $true
    $salt = [SlideCrypto]::RandomBytes(16)
    Write-Host "Setting the password (takes a few seconds)..."
    $kek = [SlideCrypto]::Kdf($pw, $salt, $Iterations)
    $wrapped = [SlideCrypto]::Seal($kek, $master)
    $check = [SlideCrypto]::Open($kek, $wrapped)
    if ([Convert]::ToBase64String($check) -ne [Convert]::ToBase64String($master)) { throw "Self-check failed; nothing was changed." }
    $k = [ordered]@{ v = 1; kdf = "PBKDF2-SHA256"; iterations = $Iterations; salt = [Convert]::ToBase64String($salt); wrapped = [Convert]::ToBase64String($wrapped) }
    New-Item -ItemType Directory -Force -Path $Out | Out-Null
    [IO.File]::WriteAllText($KeyJson, ($k | ConvertTo-Json), $Utf8)
    if (-not $KeepKey) { Remove-Item -LiteralPath $KeyFile }
    Write-Host "Password set. The website will ask for it to show the slides." -ForegroundColor Green
}
