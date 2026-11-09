<# : Maya setup. Double-click this file. (The lines up to the closing mark are for cmd; the rest is PowerShell.)
@echo off
setlocal
set "MAYA_HERE=%~dp0"
set "MAYA_SELF=%~f0"
set "MAYA_DRYRUN=%~1"
title Maya setup
powershell -NoProfile -ExecutionPolicy Bypass -Command "iex ([IO.File]::ReadAllText($env:MAYA_SELF))"
echo.
pause
exit /b
#>
# Maya setup for a new Windows 10/11 laptop. Safe to run again: it skips what is already there.
# 1. looks at this laptop  2. installs Ollama + the AI models that fit  3. Python, Node.js, Git
# 4. installs Maya  5. tests the AI with a real question  6. waits for the voice models  7. writes MEMORY.md
# "start.bat dry" only shows the plan.
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'   # downloads are 10x slower with the progress bar
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072   # TLS 1.2 on older Windows 10
$here = $env:MAYA_HERE
$report = New-Object System.Collections.Generic.List[string]
$failed = 0

function Say($text, $color = 'White') { Write-Host $text -ForegroundColor $color }
function Note($ok, $what, $detail = '') {
  if (-not $ok) { $script:failed++ }
  $report.Add(("| {0} | {1} | {2} |" -f $(if ($ok) { 'OK' } else { '**FAILED**' }), $what, ($detail -replace '\|', '/' -replace '\s+', ' ')))
  Say ("   {0} {1}  {2}" -f $(if ($ok) { '[ok]' } else { '[!!]' }), $what, $detail) $(if ($ok) { 'Green' } else { 'Yellow' })
}
function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
function Winget($id) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { return }
  winget install --id $id -e --silent --accept-package-agreements --accept-source-agreements | Out-Host
  Refresh-Path
}
function Fetch($url, $name) { $p = Join-Path $env:TEMP $name; Invoke-WebRequest $url -OutFile $p -UseBasicParsing -ErrorAction Stop; $p }
function Run-Quiet($exe, $argList, [switch]$Admin) {
  if ($Admin) { Start-Process $exe -ArgumentList $argList -Wait -Verb RunAs } else { Start-Process $exe -ArgumentList $argList -Wait }
  Refresh-Path
}

# ---------- 1. Look at this laptop (the same rules Maya itself uses) ----------
function Get-Specs {
  $ramGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1e9, 1)
  $gpu = 'none found'; $vramGB = 0
  if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
    foreach ($r in @(& nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits)) {
      $name, $mb = $r -split ','
      $gb = [math]::Round([double]$mb / 1024, 1)
      if ($gb -gt $vramGB) { $vramGB = $gb; $gpu = $name.Trim() }
    }
  }
  if ($vramGB -eq 0) {
    # Other cards: the driver's own memory size (AdapterRAM stops at 4 GB, so prefer the registry value).
    $keys = Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}' -ErrorAction SilentlyContinue
    foreach ($k in $keys) {
      $p = Get-ItemProperty $k.PSPath -ErrorAction SilentlyContinue
      $bytes = $p.'HardwareInformation.qwMemorySize'
      if (-not $bytes) { $bytes = $p.'HardwareInformation.MemorySize' }
      if ($bytes -is [byte[]]) { $bytes = [BitConverter]::ToUInt32($bytes, 0) }
      if ($bytes) {
        $gb = [math]::Round([double]$bytes / 1GB, 1)
        if ($gb -gt $vramGB) { $vramGB = $gb; $gpu = $p.DriverDesc }
      }
    }
  }
  $freeGB = [math]::Round((Get-PSDrive ($env:USERPROFILE.Substring(0, 1))).Free / 1e9, 1)
  $os = (Get-CimInstance Win32_OperatingSystem).Caption
  [pscustomobject]@{ RamGB = $ramGB; Gpu = $gpu; VramGB = $vramGB; FreeGB = $freeGB; Os = $os; Cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name }
}

# Which models fit. Sizes in GB (download size, from ollama.com).
$SIZES = @{ 'qwen3.5:2b' = 2.7; 'qwen3.5:4b' = 3.4; 'qwen3.5:9b' = 6.6; 'qwen2.5-coder:7b' = 4.7; 'nomic-embed-text' = 0.3 }
function Get-Plan($s) {
  # Lite: no 4 GB graphics card or under 10 GB RAM -> the small 2B brain (Maya switches to Lite when only the 2B is there).
  if ($s.VramGB -lt 4 -or $s.RamGB -lt 10) { $tier = 'Lite'; $models = @('qwen3.5:2b', 'nomic-embed-text') }
  elseif ($s.VramGB -ge 6 -and $s.RamGB -ge 14) { $tier = 'Full'; $models = @('qwen3.5:4b', 'qwen3.5:9b', 'qwen2.5-coder:7b', 'nomic-embed-text') }
  else { $tier = 'Standard'; $models = @('qwen3.5:4b', 'nomic-embed-text') }
  # Room for Maya, Python, its voice models, image models on a 6 GB card (about 6 GB) and Windows: drop the biggest optional models first.
  $extra = if ($s.VramGB -ge 6) { 12 } else { 6 }
  foreach ($drop in 'qwen2.5-coder:7b', 'qwen3.5:9b') {
    $need = ($models | ForEach-Object { $SIZES[$_] } | Measure-Object -Sum).Sum + $extra
    if ($need -gt $s.FreeGB -and $models -contains $drop) { $models = @($models | Where-Object { $_ -ne $drop }) }
  }
  $need = ($models | ForEach-Object { $SIZES[$_] } | Measure-Object -Sum).Sum + $extra
  [pscustomobject]@{ Tier = $tier; Models = $models; NeedGB = [math]::Round($need, 1) }
}

# ---------- MEMORY.md: what this laptop has and what setup did (send it back if something failed) ----------
function Write-Memory {
  $file = Join-Path $here 'MEMORY.md'
  $text = @(
    '', ("## Setup on {0} - {1}" -f $env:COMPUTERNAME, (Get-Date -Format 'yyyy-MM-dd HH:mm')), '',
    ("- Windows: {0}" -f $specs.Os), ("- Processor: {0}" -f $specs.Cpu), ("- Memory: {0} GB, graphics: {1} ({2} GB), free disk: {3} GB" -f $specs.RamGB, $specs.Gpu, $specs.VramGB, $specs.FreeGB),
    ("- Plan: **{0}** - models: {1}" -f $plan.Tier, ($plan.Models -join ', ')), '',
    '| Result | Step | Details |', '|---|---|---|') + $report + @('', $(if ($failed) { "**$failed step(s) failed.** Run start.bat again (it skips what is done). If it still fails, send this MEMORY.md to the person who shared Maya." } else { 'Everything is installed. Say "Hey Maya".' }))
  try { Add-Content -Path $file -Value $text -Encoding UTF8 -ErrorAction Stop }
  catch { $file = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Maya-MEMORY.md'; Add-Content -Path $file -Value $text -Encoding UTF8 }
  Say ''
  Say "   Setup report: $file" Cyan
  if ($failed) { Start-Process notepad.exe $file }
}

Say ''
Say '   =====  Maya - setup for this laptop  =====' Cyan
Say ''
$specs = Get-Specs
$plan = Get-Plan $specs
Say ("   Windows:         {0}" -f $specs.Os)
Say ("   Memory (RAM):    {0} GB" -f $specs.RamGB)
Say ("   Graphics card:   {0} ({1} GB)" -f $specs.Gpu, $specs.VramGB)
Say ("   Free disk space: {0} GB" -f $specs.FreeGB)
Say ''
$why = @{ Lite = 'small 2B brain: works on any laptop, answers are simpler'; Standard = '4B brain: fast answers, sees images'; Full = '4B fast brain + 9B smart brain + coding model' }
Say ("   Plan: {0} - {1}" -f $plan.Tier, $why[$plan.Tier]) Green
Say ("   AI models: {0}  (needs about {1} GB free)" -f ($plan.Models -join ', '), $plan.NeedGB)
Say '   Also installs: Ollama, Python 3 (numpy, pandas, matplotlib, openpyxl), Node.js, Git, Maya.'
Say ''
if ($env:MAYA_DRYRUN -eq 'dry') { Say '   Dry run: nothing installed.' Yellow; exit 0 }
if ($plan.NeedGB -gt $specs.FreeGB) {
  Note $false 'Free disk space' ("need about {0} GB, have {1} GB: free up space and run start.bat again" -f $plan.NeedGB, $specs.FreeGB)
  Write-Memory; exit 1
}
if (-not [Environment]::Is64BitOperatingSystem) { Note $false 'Windows 64-bit' 'Maya needs 64-bit Windows 10 or 11'; Write-Memory; exit 1 }

# ---------- 2. Ollama (the local AI engine) and the AI models ----------
function Find-Ollama {
  foreach ($p in (Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'), (Join-Path $env:ProgramFiles 'Ollama\ollama.exe')) { if (Test-Path $p) { return $p } }
  $c = Get-Command ollama -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
}
function Test-Ollama { try { (Invoke-WebRequest 'http://127.0.0.1:11434/api/version' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { $false } }
function Start-Ollama {
  if (-not (Test-Ollama)) { Start-Process (Find-Ollama) -ArgumentList 'serve' -WindowStyle Hidden }
  for ($i = 0; $i -lt 40 -and -not (Test-Ollama); $i++) { Start-Sleep 1 }
  Test-Ollama
}
function Install-Ollama([switch]$Newest) {
  Get-Process 'ollama*' -ErrorAction SilentlyContinue | Stop-Process -Force
  if (-not $Newest) { Winget 'Ollama.Ollama' }
  if ($Newest -or -not (Find-Ollama)) {
    try { Run-Quiet (Fetch 'https://ollama.com/download/OllamaSetup.exe' 'OllamaSetup.exe') '/VERYSILENT', '/NORESTART', '/SUPPRESSMSGBOXES' } catch { Say "   $($_.Exception.Message)" Yellow }
  }
}
Say '[1/7] Ollama, the local AI engine'
if (-not (Find-Ollama)) { Say '   Installing Ollama (about 1 GB)...'; Install-Ollama }
$up = (Find-Ollama) -and (Start-Ollama)
$ver = if ($up) { (Invoke-RestMethod 'http://127.0.0.1:11434/api/version').version } else { '' }
Note $up 'Ollama' $(if ($up) { "version $ver, running" } else { 'not installed or not starting: install it from https://ollama.com/download' })

Say ("[2/7] AI models ({0}). The long part; it resumes if the internet drops." -f ($plan.Models -join ', '))
if ($up) {
  $ollama = Find-Ollama
  foreach ($m in $plan.Models) {
    Say "      $m ..." Cyan
    $ok = $false
    for ($try = 1; $try -le 3 -and -not $ok; $try++) {
      & $ollama pull $m
      $ok = $LASTEXITCODE -eq 0
      if (-not $ok) {
        # An old Ollama cannot run new models ("requires a newer version"): update it once, then retry.
        $pullErr = (& $ollama pull $m 2>&1 | Out-String)
        if ($pullErr -match 'newer version|update ollama|unsupported') { Say '      This Ollama is too old for this model: updating Ollama...' Yellow; Install-Ollama -Newest; $null = Start-Ollama }
        else { Say "      Download stopped, trying again ($try of 3)..." Yellow; Start-Sleep 5 }
      }
    }
    Note $ok "AI model $m" $(if ($ok) { 'downloaded' } else { 'could not download: check the internet and run start.bat again' })
  }
}

# ---------- 3. Python (charts, Excel, "run this code"), Node.js (browser add-ons), Git (app builder) ----------
Say '[3/7] Python, Node.js and Git'
function Python-Ok { try { (& python -c "import sys; print(sys.version_info[0])" 2>$null) -eq '3' } catch { $false } }
if (-not (Python-Ok)) {
  Say '   Installing Python 3.12...'
  Winget 'Python.Python.3.12'
  if (-not (Python-Ok)) {
    try { Run-Quiet (Fetch 'https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe' 'python-setup.exe') '/quiet', 'InstallAllUsers=0', 'PrependPath=1', 'Include_launcher=0' } catch { Say "   $($_.Exception.Message)" Yellow }
  }
}
if (Python-Ok) {
  # Maya's own Python folder (it uses this one when it exists), with the libraries its tools import.
  $venv = Join-Path $env:APPDATA 'Ather\python'
  if (-not (Test-Path (Join-Path $venv 'Scripts\python.exe'))) { & python -m venv --system-site-packages $venv }
  $py = Join-Path $venv 'Scripts\python.exe'
  & $py -m pip install --quiet --disable-pip-version-check numpy pandas matplotlib openpyxl
  $libs = (& $py -c "import numpy, pandas, matplotlib, openpyxl; print('ok')" 2>$null) -eq 'ok'
  Note $libs 'Python 3 + numpy, pandas, matplotlib, openpyxl' $(if ($libs) { (& python --version) } else { 'libraries did not install' })
} else { Note $false 'Python 3' 'not installed: get it from https://www.python.org (tick "Add to PATH")' }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Say '   Installing Node.js LTS...'
  Winget 'OpenJS.NodeJS.LTS'
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    try {
      $v = ((Invoke-RestMethod 'https://nodejs.org/dist/index.json' -ErrorAction Stop) | Where-Object { $_.lts } | Select-Object -First 1).version
      Run-Quiet 'msiexec.exe' '/i', (Fetch "https://nodejs.org/dist/$v/node-$v-x64.msi" 'node-setup.msi'), '/passive', '/norestart' -Admin
    } catch { Say "   $($_.Exception.Message)" Yellow }
  }
}
$node = [bool](Get-Command node -ErrorAction SilentlyContinue)
Note $node 'Node.js' $(if ($node) { (& node --version) } else { 'not installed (only browser add-ons need it): https://nodejs.org' })

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Say '   Installing Git...'
  Winget 'Git.Git'
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    try {
      $a = (Invoke-RestMethod 'https://api.github.com/repos/git-for-windows/git/releases/latest' -ErrorAction Stop).assets | Where-Object { $_.name -match '64-bit\.exe$' -and $_.name -notmatch 'Portable' } | Select-Object -First 1
      Run-Quiet (Fetch $a.browser_download_url 'git-setup.exe') '/VERYSILENT', '/NORESTART' -Admin
    } catch { Say "   $($_.Exception.Message)" Yellow }
  }
}
$git = [bool](Get-Command git -ErrorAction SilentlyContinue)
Note $git 'Git' $(if ($git) { (& git --version) } else { 'not installed (only the app builder needs it): https://git-scm.com' })

# ---------- 4. Maya ----------
Say '[4/7] Maya'
function Find-Maya { foreach ($p in (Join-Path $env:LOCALAPPDATA 'Programs\ather\Maya.exe'), (Join-Path $env:ProgramFiles 'ather\Maya.exe')) { if (Test-Path $p) { return $p } } }
$setup = Get-ChildItem $here -Filter 'Maya-Setup-*.exe' -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -Last 1
if (-not $setup) {
  Say '   Downloading the newest Maya from GitHub...'
  try {
    $a = (Invoke-RestMethod 'https://api.github.com/repos/Achu226/ather/releases/latest' -ErrorAction Stop).assets | Where-Object name -like 'Maya-Setup-*.exe' | Select-Object -First 1
    $setup = Get-Item (Fetch $a.browser_download_url $a.name)
  } catch { Say "   $($_.Exception.Message)" Yellow }
}
if ($setup) {
  Say ("   Installing {0}..." -f $setup.Name)
  Unblock-File $setup.FullName -ErrorAction SilentlyContinue   # Maya's own installer, unzipped from a download
  Get-Process Maya -ErrorAction SilentlyContinue | Stop-Process -Force   # an older Maya must be closed to update it
  Start-Process $setup.FullName -ArgumentList '/S' -Wait
}
$maya = Find-Maya
Note ([bool]$maya) 'Maya app' $(if ($maya) { "version $((Get-Item $maya).VersionInfo.ProductVersion) in $maya" } else { 'did not install: double-click the Maya-Setup file instead' })

# ---------- 5. Does the AI really answer? ----------
Say '[5/7] Asking the AI a test question (the first answer can take a minute)...'
$brain = $plan.Models | Where-Object { $_ -like 'qwen3.5*' } | Select-Object -First 1
if ($up) {
  try {
    $t = Get-Date
    $body = @{ model = $brain; stream = $false; think = $false; messages = @(@{ role = 'user'; content = 'What is the capital of France? Answer in one word.' }) } | ConvertTo-Json -Depth 4
    $answer = (Invoke-RestMethod 'http://127.0.0.1:11434/api/chat' -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 600 -ErrorAction Stop).message.content.Trim()
    Note ($answer -match 'Paris') "AI answers ($brain)" ("said '{0}' in {1:N0} s" -f $answer, ((Get-Date) - $t).TotalSeconds)
  } catch { Note $false "AI answers ($brain)" $_.Exception.Message }
} else { Note $false 'AI answers' 'Ollama is not running' }

# ---------- 6. Maya downloads its ears and voice by itself; wait for them ----------
Say '[6/7] Starting Maya: it downloads its ears and voice by itself (about 1 GB)...'
if ($maya) {
  Start-Process $maya
  $hf = Join-Path $env:APPDATA 'Ather\models\hf\onnx-community'
  $parts = [ordered]@{ 'Listening (Whisper small)' = 'whisper-small'; 'Voice (Kokoro)' = 'Kokoro-82M-v1.0-ONNX'; '"Hey Maya" listener' = 'whisper-tiny.en' }
  $ready = { @($parts.Values | Where-Object { -not (Get-ChildItem (Join-Path $hf $_) -Recurse -Filter '*.onnx' -ErrorAction SilentlyContinue) }).Count -eq 0 }
  for ($i = 0; $i -lt 180 -and -not (& $ready); $i++) { if ($i % 6 -eq 0) { Say '      still downloading...' }; Start-Sleep 10 }
  foreach ($k in $parts.Keys) {
    $has = [bool](Get-ChildItem (Join-Path $hf $parts[$k]) -Recurse -Filter '*.onnx' -ErrorAction SilentlyContinue)
    Note $has $k $(if ($has) { 'ready' } else { "not finished yet: leave Maya's setup screen open until every line has a tick" })
  }
}

# ---------- 7. Report ----------
Say '[7/7] Writing the setup report (MEMORY.md)'
Write-Memory
Say ''
if ($failed) { Say "   $failed step(s) need attention: see MEMORY.md (it just opened)." Yellow; exit 1 }
Say '   Done! Say "Hey Maya", move the mouse to the top of the screen, or press Ctrl+Space.' Green
exit 0
