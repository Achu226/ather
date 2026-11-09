// PC control and activity sensing through one long-running PowerShell helper (Win32 + Core Audio via C#).
import { spawn, execFile } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { dataDir } from '../paths.js';
import { createInterface } from 'node:readline';
import { join, basename } from 'node:path';

const HELPER = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type @"
using System; using System.Text; using System.Diagnostics; using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential)] public struct AtherKeyInput { public ushort vk; public ushort scan; public uint flags; public uint time; public IntPtr extra; }
[StructLayout(LayoutKind.Sequential)] public struct AtherMouseInput { public int dx; public int dy; public uint data; public uint flags; public uint time; public IntPtr extra; }
[StructLayout(LayoutKind.Explicit)] public struct AtherInputUnion { [FieldOffset(0)] public AtherMouseInput mi; [FieldOffset(0)] public AtherKeyInput ki; }
[StructLayout(LayoutKind.Sequential)] public struct AtherInput { public uint type; public AtherInputUnion u; }
public static class AtherPc {
  [DllImport("user32.dll")] static extern uint SendInput(uint n, AtherInput[] inputs, int size);
  // Real Unicode keystrokes: web pages, chat apps and Tamil text receive them like a person typing.
  public static void TypeText(string text) {
    foreach (char ch in text) {
      var down = new AtherInput { type = 1 }; down.u.ki = new AtherKeyInput { scan = ch, flags = 0x0004 };
      var up = new AtherInput { type = 1 }; up.u.ki = new AtherKeyInput { scan = ch, flags = 0x0006 };
      SendInput(2, new[] { down, up }, Marshal.SizeOf(typeof(AtherInput)));
      System.Threading.Thread.Sleep(3);
    }
  }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool LockWorkStation();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, int dx, int dy, int data, UIntPtr extra);
  public static IntPtr Fg() { return GetForegroundWindow(); }
  public static string Foreground() {
    var h = GetForegroundWindow(); var sb = new StringBuilder(512); GetWindowText(h, sb, 512);
    uint pid; GetWindowThreadProcessId(h, out pid); string name = "";
    try { name = Process.GetProcessById((int)pid).ProcessName; } catch {}
    return name + "\t" + sb.ToString() + "\t" + h.ToInt64();
  }
  public static bool Activate(long h) { ShowWindow((IntPtr)h, 9); return SetForegroundWindow((IntPtr)h); }
  public static void Click(int x, int y, bool right) {
    SetCursorPos(x, y); System.Threading.Thread.Sleep(40);
    if (right) { mouse_event(0x08, 0, 0, 0, UIntPtr.Zero); mouse_event(0x10, 0, 0, 0, UIntPtr.Zero); }
    else { mouse_event(0x02, 0, 0, 0, UIntPtr.Zero); mouse_event(0x04, 0, 0, 0, UIntPtr.Zero); }
  }
  public static void Move(int x, int y) { SetCursorPos(x, y); }
  // Press, glide in small steps (apps need to see the movement to start a drag), release.
  public static void Drag(int x1, int y1, int x2, int y2) {
    SetCursorPos(x1, y1); System.Threading.Thread.Sleep(60);
    mouse_event(0x02, 0, 0, 0, UIntPtr.Zero); System.Threading.Thread.Sleep(120);
    for (int i = 1; i <= 20; i++) { SetCursorPos(x1 + (x2 - x1) * i / 20, y1 + (y2 - y1) * i / 20); System.Threading.Thread.Sleep(15); }
    System.Threading.Thread.Sleep(120); mouse_event(0x04, 0, 0, 0, UIntPtr.Zero);
  }
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr ctx);
  // Real pixels for everything (cursor and UI Automation alike); otherwise Windows switches modes once UI Automation is used.
  public static void RealPixels() { SetProcessDpiAwarenessContext((IntPtr)(-4)); SetThreadDpiAwarenessContext((IntPtr)(-4)); }
  public static void ClickHere(bool right) {
    if (right) { mouse_event(0x08, 0, 0, 0, UIntPtr.Zero); mouse_event(0x10, 0, 0, 0, UIntPtr.Zero); }
    else { mouse_event(0x02, 0, 0, 0, UIntPtr.Zero); mouse_event(0x04, 0, 0, 0, UIntPtr.Zero); }
  }
  public static void Scroll(int amount) { mouse_event(0x0800, 0, 0, amount, UIntPtr.Zero); }
  public static void Key(byte vk) { keybd_event(vk, 0, 0, UIntPtr.Zero); keybd_event(vk, 0, 2, UIntPtr.Zero); }
  // Key combinations SendKeys cannot send (anything with the Windows key): all down, then up in reverse.
  public static void Chord(byte[] vks) { foreach (var k in vks) keybd_event(k, 0, 0, UIntPtr.Zero); for (int i = vks.Length - 1; i >= 0; i--) keybd_event(vks[i], 0, 2, UIntPtr.Zero); }
  public static void MinimizeForeground() { ShowWindow(GetForegroundWindow(), 6); }
}
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume { int f(); int g(); int h(); int i(); int SetMasterVolumeLevelScalar(float level, Guid ctx); int j();
  int GetMasterVolumeLevelScalar(out float level); int k(); int l(); int m(); int n(); int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, Guid ctx); int GetMute(out bool mute); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int clsCtx, int p, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public static class AtherAudio {
  static IAudioEndpointVolume Vol() {
    var e = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator; IMMDevice d = null;
    Marshal.ThrowExceptionForHR(e.GetDefaultAudioEndpoint(0, 1, out d));
    IAudioEndpointVolume v = null; var id = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(d.Activate(ref id, 23, 0, out v)); return v;
  }
  public static int Get() { float v; Marshal.ThrowExceptionForHR(Vol().GetMasterVolumeLevelScalar(out v)); return (int)Math.Round(v * 100); }
  public static void Set(int p) { Marshal.ThrowExceptionForHR(Vol().SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(100, p)) / 100f, Guid.Empty)); }
  public static void Mute(bool m) { Marshal.ThrowExceptionForHR(Vol().SetMute(m, Guid.Empty)); }
}
"@
[AtherPc]::RealPixels()
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms, WindowsBase
$global:els = @()
$wanted = 'Button','Edit','Hyperlink','MenuItem','ListItem','TabItem','CheckBox','RadioButton','ComboBox','Document','TreeItem','SplitButton','Text','DataItem'
# This helper works in real pixels; Maya (Electron) uses Windows' scaled pixels (e.g. at 125%).
# Positions are converted here, with the scale Maya sends ('dpi' command).
$global:dpi = 1.0
function Get-Dpi { $global:dpi }
function Click-Center($r) { [AtherPc]::Click([int]($r.X + $r.Width / 2), [int]($r.Y + $r.Height / 2), $false) }
# Chrome, Edge and Electron apps (WhatsApp, Teams…) only expose their page after a first look,
# so a nearly empty result is looked at once more.
function Get-Elements {
  $json = Collect-Elements
  if ($global:els.Count -lt 25) { Start-Sleep -Milliseconds 900; $json = Collect-Elements }
  $json
}
# Visible, named controls of the active window (breadth-first, capped), remembered by index for click/type.
function Collect-Elements {
  $root = [System.Windows.Automation.AutomationElement]::FromHandle([AtherPc]::Fg())
  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $queue = New-Object System.Collections.Queue; $queue.Enqueue($root)
  $global:els = @(); $out = @(); $seen = 0; $d = Get-Dpi
  $clock = [Diagnostics.Stopwatch]::StartNew() # huge apps can take a long time to walk; 4 s is enough to act
  while ($queue.Count -gt 0 -and $seen -lt 4000 -and $global:els.Count -lt 200 -and $clock.ElapsedMilliseconds -lt 4000) {
    $e = $queue.Dequeue(); $seen++
    try { $c = $e.Current } catch { continue }
    $t = $c.ControlType.ProgrammaticName -replace 'ControlType\.', ''
    $r = $c.BoundingRectangle
    if (-not $c.IsOffscreen -and $r.Width -gt 2 -and $wanted -contains $t -and ($c.Name -or $t -eq 'Edit' -or $t -eq 'Document')) {
      $global:els += $e
      $n = if ($c.Name) { $c.Name.Substring(0, [Math]::Min(70, $c.Name.Length)) } else { '' }
      $out += [pscustomobject]@{ i = $global:els.Count - 1; type = $t; name = $n; x = [int](($r.X + $r.Width / 2) / $d); y = [int](($r.Y + $r.Height / 2) / $d); w = [int]($r.Width / $d); h = [int]($r.Height / $d); password = [bool]$c.IsPassword }
    }
    try { $child = $walker.GetFirstChild($e); while ($child) { $queue.Enqueue($child); $child = $walker.GetNextSibling($child) } } catch {}
  }
  ConvertTo-Json -InputObject @($out) -Compress -Depth 3
}
function Get-El($i) { $e = $global:els[[int]$i]; if (-not $e) { throw "No element $i; look at the window again first." }; $e }
# Text to read aloud: the whole document where the app offers it (Chrome pages, Notepad, Word), else the visible text pieces.
function Read-Text {
  $root = [System.Windows.Automation.AutomationElement]::FromHandle([AtherPc]::Fg())
  $isDoc = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Document)
  $doc = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $isDoc)
  if ($doc) { try { $t = $doc.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern).DocumentRange.GetText(20000); if ($t.Trim()) { return $t } } catch {} }
  $isText = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Text)
  $parts = foreach ($e in $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $isText)) { if (-not $e.Current.IsOffscreen -and $e.Current.Name) { $e.Current.Name } }
  $all = $parts -join [char]10
  $all.Substring(0, [Math]::Min(20000, $all.Length))
}
# UTF-8 both ways: the console default (an old DOS code page) garbles Tamil, Hindi, accents and emoji.
$utf8 = New-Object Text.UTF8Encoding $false
$stdin = New-Object IO.StreamReader([Console]::OpenStandardInput(), $utf8)
$stdout = New-Object IO.StreamWriter([Console]::OpenStandardOutput(), $utf8); $stdout.AutoFlush = $true
while ($true) {
  $line = $stdin.ReadLine(); if ($null -eq $line) { break }
  $id, $cmd, $arg = $line -split "\t", 3
  try {
    $r = switch ($cmd) {
      'fg' { [AtherPc]::Foreground() }
      'key' { [AtherPc]::Key([byte]$arg); 'ok' }
      'move' { $x, $y = $arg -split ','; [AtherPc]::Move([int]([double]$x * $global:dpi), [int]([double]$y * $global:dpi)); 'ok' }
      'clickhere' { [AtherPc]::ClickHere($arg -eq 'right'); 'ok' }
      'vol' { if ($arg -ne '') { [AtherAudio]::Set([int]$arg) }; [AtherAudio]::Get() }
      'mute' { [AtherAudio]::Mute($arg -eq '1'); 'ok' }
      'min' { [AtherPc]::MinimizeForeground(); 'ok' }
      'lock' { [void][AtherPc]::LockWorkStation(); 'ok' }
      'bright' {
        if ($arg -ne '') { Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = [byte]$arg } | Out-Null }
        (Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness).CurrentBrightness }
      'activate' { [AtherPc]::Activate([long]$arg) }
      'elements' { Get-Elements }
      'readtext' { Read-Text }
      'invoke' {
        $e = Get-El $arg
        # A text field must get the typing cursor: Chrome accepts "invoke" on one without focusing it.
        $t = $e.Current.ControlType.ProgrammaticName
        if ($t -match 'Edit|ComboBox|Document') { try { $e.SetFocus() } catch {}; Click-Center $e.Current.BoundingRectangle; 'focused' }
        else { try { $e.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); 'invoked' }
        catch { Click-Center $e.Current.BoundingRectangle; 'clicked' } } }
      'settext' {
        $i, $text = $arg -split "\x1f", 2; $e = Get-El $i
        if ($e.Current.IsPassword) { throw 'That is a password field; Maya never types passwords.' }
        $how = 'typed'
        # A document (Notepad, Word…) is added to at the end; replacing it would destroy the user's text.
        $isDoc = $e.Current.ControlType -eq [System.Windows.Automation.ControlType]::Document
        if (-not $isDoc) { try { $vp = $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern); $vp.SetValue($text); if ($vp.Current.Value -eq $text) { $how = 'set' } } catch {} }
        # Some apps ignore or refuse a programmatic value: focus the field and type for real.
        if ($how -ne 'set') {
          try { $e.SetFocus() } catch { Click-Center $e.Current.BoundingRectangle }
          Start-Sleep -Milliseconds 150
          if ($isDoc) { [System.Windows.Forms.SendKeys]::SendWait('^{END}'); $how = 'added at the end' } else { [System.Windows.Forms.SendKeys]::SendWait('^a') }
          [AtherPc]::TypeText($text)
        }
        $how }
      'type' { [AtherPc]::TypeText($arg); 'typed' }
      'dpi' { $global:dpi = [double]::Parse($arg, [Globalization.CultureInfo]::InvariantCulture); 'ok' }
      'drag' { $a = $arg -split ',' | ForEach-Object { [int]([double]$_ * $global:dpi) }; [AtherPc]::Drag($a[0], $a[1], $a[2], $a[3]); 'dragged' }
      'click' { $x, $y, $b = $arg -split ','; [AtherPc]::Click([int]([double]$x * $global:dpi), [int]([double]$y * $global:dpi), $b -eq 'right'); 'clicked' }
      'keys' { [System.Windows.Forms.SendKeys]::SendWait($arg); 'sent' }
      'chord' { [AtherPc]::Chord([byte[]]($arg -split ',' | ForEach-Object { [byte]$_ })); 'sent' }
      'scroll' { [AtherPc]::Scroll([int]$arg); 'scrolled' }
      # What is under the mouse pointer (for "what is this?"): its kind, name, value and hint.
      'atpoint' {
        $p = [System.Windows.Forms.Cursor]::Position
        $e = [System.Windows.Automation.AutomationElement]::FromPoint((New-Object System.Windows.Point($p.X, $p.Y)))
        $c = $e.Current; $v = ''
        try { $v = $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value } catch {}
        $kind = $c.ControlType.ProgrammaticName -replace '^ControlType\.', ''
        (@($kind, $c.Name, $v, $c.HelpText) | ForEach-Object { "$_" -replace '\s+', ' ' }) -join [char]9 }
      default { throw "unknown command $cmd" }
    }
    $stdout.WriteLine((@{ id = $id; ok = $true; result = "$r" } | ConvertTo-Json -Compress))
  } catch {
    $stdout.WriteLine((@{ id = $id; ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress))
  }
}
`;

export const MEDIA_KEYS = { mute: 0xad, volume_down: 0xae, volume_up: 0xaf, next: 0xb0, previous: 0xb1, stop: 0xb2, play_pause: 0xb3 };

// Apps without Start Menu shortcuts, opened by a fixed command (never by model-supplied text).
const BUILTIN_APPS = {
  calculator: 'calc', notepad: 'notepad', paint: 'mspaint', 'file explorer': 'explorer', explorer: 'explorer',
  'task manager': 'taskmgr', 'command prompt': 'cmd', terminal: 'wt', settings: 'ms-settings:', camera: 'microsoft.windows.camera:',
  'snipping tool': 'ms-screenclip:', clock: 'ms-clock:', photos: 'ms-photos:', store: 'ms-windows-store:', mail: 'outlookmail:',
};

export const SETTINGS_PAGES = {
  wifi: 'ms-settings:network-wifi', bluetooth: 'ms-settings:bluetooth', display: 'ms-settings:display', sound: 'ms-settings:sound',
  battery: 'ms-settings:batterysaver', update: 'ms-settings:windowsupdate', apps: 'ms-settings:appsfeatures', notifications: 'ms-settings:notifications',
  focus: 'ms-settings:quiethours', privacy: 'ms-settings:privacy', microphone: 'ms-settings:privacy-microphone', storage: 'ms-settings:storagesense',
  'night light': 'ms-settings:nightlight', personalization: 'ms-settings:personalization', mouse: 'ms-settings:mousetouchpad',
};

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Websites people call apps: "open Gmail" goes to the user's signed-in account in Chrome, never to a Google search.
const WEB_APPS = {
  gmail: 'https://mail.google.com/', 'google mail': 'https://mail.google.com/', 'my mail': 'https://mail.google.com/', 'my email': 'https://mail.google.com/',
  chatgpt: 'https://chatgpt.com/', 'chat gpt': 'https://chatgpt.com/', gpt: 'https://chatgpt.com/', openai: 'https://chatgpt.com/',
  claude: 'https://claude.ai/new', gemini: 'https://gemini.google.com/app', 'google gemini': 'https://gemini.google.com/app',
  copilot: 'https://copilot.microsoft.com/', perplexity: 'https://www.perplexity.ai/', deepseek: 'https://chat.deepseek.com/',
  'whatsapp web': 'https://web.whatsapp.com/', whatsapp: 'https://web.whatsapp.com/', youtube: 'https://www.youtube.com/',
  'google drive': 'https://drive.google.com/', drive: 'https://drive.google.com/', 'google docs': 'https://docs.google.com/document/',
  'google sheets': 'https://docs.google.com/spreadsheets/', 'google calendar': 'https://calendar.google.com/', 'google meet': 'https://meet.google.com/',
  'google classroom': 'https://classroom.google.com/', 'google photos': 'https://photos.google.com/', 'google maps': 'https://maps.google.com/', maps: 'https://maps.google.com/',
  outlook: 'https://outlook.live.com/mail/', instagram: 'https://www.instagram.com/', facebook: 'https://www.facebook.com/', linkedin: 'https://www.linkedin.com/',
  twitter: 'https://x.com/', x: 'https://x.com/', github: 'https://github.com/', netflix: 'https://www.netflix.com/', spotify: 'https://open.spotify.com/',
  amazon: 'https://www.amazon.in/', flipkart: 'https://www.flipkart.com/', 'google translate': 'https://translate.google.com/', canva: 'https://www.canva.com/',
};
/** The user's Chrome profiles: folder, name, signed-in account, and which was used last (exported for the My Maya page). */
export function chromeProfiles(localState = join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data', 'Local State')) {
  try {
    const { profile } = JSON.parse(readFileSync(localState, 'utf8'));
    return Object.entries(profile?.info_cache || {}).map(([dir, p]) => ({ dir, name: p.name || dir, account: p.gaia_name || p.user_name || '', lastUsed: dir === profile.last_used }));
  } catch { return []; }
}

/** The website for an app name that is really a website, or null (exported for tests). */
export const webAppUrl = (name) => WEB_APPS[norm(String(name)).replace(/^(the|my) (?!mail|email)/, '').replace(/ (website|site|web|app|account)$/, '')] || null;
const ALIASES = { 'vs code': 'visual studio code', vscode: 'visual studio code', code: 'visual studio code', chrome: 'google chrome',
  edge: 'microsoft edge', ppt: 'powerpoint', teams: 'microsoft teams', 'ms word': 'word', 'ms excel': 'excel',
  // How Whisper often hears "WhatsApp".
  'what s up': 'whatsapp', 'whats up': 'whatsapp', 'what s app': 'whatsapp', 'whats app': 'whatsapp', 'watsapp': 'whatsapp' };
/** The app name the user meant ("what's up" → "whatsapp"). */
export const appName = (spoken) => ALIASES[norm(spoken)] || spoken;

/** Best Start Menu shortcut for a spoken app name (exported for tests). */
export function matchApp(query, names) {
  const q = ALIASES[norm(query)] || norm(query);
  const scored = names.map((name) => {
    const n = norm(name);
    let score = 0;
    if (n === q) score = 100;
    else if (n.startsWith(q)) score = 80;
    else if (n.includes(q)) score = 60;
    else {
      const words = q.split(' ');
      score = (words.filter((w) => w.length > 1 && n.includes(w)).length / words.length) * 50;
    }
    if (/uninstall|readme|help|documentation|release notes/.test(n)) score -= 40;
    return { name, score: score - n.length / 100 };
  }).filter((s) => s.score >= 25).sort((a, b) => b.score - a.score);
  return scored[0]?.name ?? null;
}

const BROWSERS = new Set(['chrome', 'msedge', 'firefox', 'brave', 'opera', 'vivaldi', 'arc']);
const FRIENDLY = { Code: 'VS Code', WINWORD: 'Word', EXCEL: 'Excel', POWERPNT: 'PowerPoint', msedge: 'Edge', chrome: 'Chrome', firefox: 'Firefox', explorer: 'File Explorer', WindowsTerminal: 'Terminal', idea64: 'IntelliJ IDEA', pycharm64: 'PyCharm', Spotify: 'Spotify', Maya: 'Maya', Discord: 'Discord', WhatsApp: 'WhatsApp', Telegram: 'Telegram', ONENOTE: 'OneNote' };

/** "Lecture 5 - YouTube - Google Chrome" → { app: 'Chrome', label: 'YouTube' }. Exported for tests. */
export function describeWindow(process, title) {
  const app = FRIENDLY[process] || process;
  if (!BROWSERS.has(process)) return { app, label: app };
  const parts = title.replace(/ and \d+ more pages?/, '').split(/ [-–—|] /).map((p) => p.trim()).filter(Boolean);
  parts.pop(); // the browser's own name
  if (process === 'msedge' && parts.length >= 2) parts.pop(); // Edge adds the profile name ("Personal")
  const site = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  return { app, label: site && site.length < 40 ? site.replace(/^\(\d+\)\s*/, '') : app };
}

/** scale() is the main screen's scale factor (1.25 at 125%), from Electron; control positions come back in scaled pixels. */
/** Carries out a face gesture's action at the pointer (the list is FACE_ACTIONS in renderer/shared/headpose.js). */
export async function faceAction(pc, action) {
  const run = {
    click: () => pc.clickHere('left'), right: () => pc.clickHere('right'),
    double: async () => { await pc.clickHere('left'); await pc.clickHere('left'); },
    scrollUp: () => pc.scroll(360), scrollDown: () => pc.scroll(-360),
    enter: () => pc.keys('{ENTER}'), escape: () => pc.keys('{ESC}'), tab: () => pc.keys('{TAB}'),
  }[action];
  if (!run) throw new Error(`Unknown face action "${action}"`);
  return run();
}

export function createPc({ shell, scale = () => 1, chromeChoice = () => null }) {
  let child = null;
  let seq = 0;
  const pending = new Map();

  function start() {
    // The helper is too long for a command line (Windows allows 32,767 characters), so it runs from a file.
    // The BOM makes Windows PowerShell 5.1 read it as UTF-8.
    const script = join(dataDir, 'pc-helper.ps1');
    const body = `﻿${HELPER}`;
    // Written only when it changed, and atomically: several Maya processes (or tests) may start helpers at once.
    if (!existsSync(script) || readFileSync(script, 'utf8') !== body) {
      const tmp = `${script}.${process.pid}.tmp`;
      writeFileSync(tmp, body);
      renameSync(tmp, script);
    }
    child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    child.stdin.write(`0\tdpi\t${scale()}\n`); // before any move or click (id 0: no reply awaited)
    createInterface({ input: child.stdout }).on('line', (line) => {
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      msg.ok ? p.resolve(msg.result) : p.reject(new Error(msg.error));
    });
    child.on('exit', () => {
      child = null;
      for (const p of pending.values()) p.reject(new Error('PC helper stopped'));
      pending.clear();
    });
  }

  function send(cmd, arg = '') {
    if (!child) start();
    const id = String(++seq);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      child.stdin.write(`${id}\t${cmd}\t${arg}\n`);
      setTimeout(() => { if (pending.delete(id)) reject(new Error('PC helper timed out')); }, 15_000);
    });
  }

  const startMenu = [join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs'), join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs')];
  function shortcuts() {
    const found = {};
    for (const dir of startMenu) {
      try {
        for (const f of readdirSync(dir, { recursive: true })) if (f.toLowerCase().endsWith('.lnk')) found[basename(f, '.lnk')] ??= join(dir, f);
      } catch { /* folder missing */ }
    }
    return found;
  }

  const startUri = (target) => new Promise((resolve) => execFile('cmd.exe', ['/c', 'start', '""', target], { windowsHide: true }, () => resolve()));

  const quiet = (exe, args) => new Promise((resolve) => execFile(exe, args, { windowsHide: true, timeout: 20_000 }, (e, out) => resolve(e ? '' : out)));
  // Every app in the Start menu, including Store apps (WhatsApp, Spotify…) that have no .lnk file. Cached 10 minutes.
  let startApps = null, startAppsAt = 0;
  async function storeApps() {
    if (startApps && Date.now() - startAppsAt < 600_000) return startApps;
    const out = await quiet('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-StartApps | ConvertTo-Json -Compress']);
    try { startApps = Object.fromEntries([].concat(JSON.parse(out)).map((a) => [a.Name, a.AppID])); } catch { startApps = {}; }
    startAppsAt = Date.now();
    return startApps;
  }
  async function chromePath() {
    for (const hive of ['HKCU', 'HKLM']) {
      const m = (await quiet('reg.exe', ['query', `${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe`, '/ve'])).match(/REG_SZ\s+(.+\.exe)/i);
      if (m) return m[1].trim();
    }
    return null;
  }
  // Chrome shows a profile picker when there are several profiles: Maya opens the one the user chose
  // (My Maya), else the one used last, and clicks it in the picker itself if the picker still appears.
  function chromeProfile() {
    const profiles = chromeProfiles();
    const wanted = chromeChoice();
    return profiles.find((p) => p.dir === wanted) || profiles.find((p) => p.lastUsed) || profiles[0] || null;
  }
  async function startChrome(args = []) {
    const chrome = await chromePath();
    if (!chrome) return false;
    const profile = chromeProfile();
    spawn(chrome, [...(profile ? [`--profile-directory=${profile.dir}`] : []), ...args], { detached: true, stdio: 'ignore' }).unref();
    if (profile) pickChromeProfile(profile).catch(() => {});
    return true;
  }
  /** "Who's using Chrome?": click the user's profile, like a person would. */
  async function pickChromeProfile(profile) {
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 700));
      const fg = await send('fg').catch(() => '');
      if (!/^chrome\t/i.test(fg)) continue;
      const items = JSON.parse((await send('elements').catch(() => '[]')) || '[]');
      if (!items.some((e) => /who.s using chrome|guest mode/i.test(e.name || ''))) return;
      const card = items.find((e) => [profile.name, profile.account].filter(Boolean).some((n) => (e.name || '').toLowerCase().includes(n.toLowerCase())));
      if (card) { await send('invoke', card.i); return; }
    }
  }

  /** Start menu shortcut → Start menu/Store app → otherwise search for it in Chrome (or the default browser). */
  async function openApp(name) {
    const builtin = BUILTIN_APPS[norm(name)];
    if (builtin) { await startUri(builtin); return { opened: name }; }
    name = appName(name);
    const links = shortcuts();
    let match = matchApp(name, Object.keys(links));
    if (match === 'Google Chrome' && await startChrome()) return { opened: match };
    if (match) {
      const err = await shell.openPath(links[match]);
      return err ? { error: err } : { opened: match };
    }
    const apps = await storeApps();
    match = matchApp(name, Object.keys(apps));
    if (match) { execFile('explorer.exe', [`shell:AppsFolder\\${apps[match]}`]); return { opened: match }; }
    // Gmail, ChatGPT, WhatsApp Web…: the site itself, in Chrome where the user is signed in.
    const site = webAppUrl(name);
    if (site) {
      if (!(await startChrome([site]))) await shell.openExternal(site);
      return { opened: name, website: site, tell_user: `I opened ${name} in your browser.` };
    }
    const url = `https://www.google.com/search?q=${encodeURIComponent(name)}`;
    const chrome = await startChrome([url]);
    if (!chrome) await shell.openExternal(url);
    const browser = chrome ? 'Chrome' : 'your browser';
    return { not_installed: name, opened: browser, searched_for: name,
      tell_user: `${name} is not installed on this PC, so I opened ${browser} and searched for "${name}".` };
  }

  async function power(action, minutes = 0) {
    const seconds = String(Math.max(0, Math.round(minutes * 60)));
    const args = { shutdown: ['/s', '/t', seconds], restart: ['/r', '/t', seconds], cancel: ['/a'] }[action];
    if (action === 'sleep') { execFile('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']); return { done: 'sleep' }; }
    if (!args) throw new Error('action must be shutdown, restart, sleep or cancel');
    await new Promise((resolve, reject) => execFile('shutdown.exe', args, { windowsHide: true }, (e) => (e && action !== 'cancel' ? reject(e) : resolve())));
    return { done: action, minutes };
  }

  async function closeApp(name) {
    if (!/^[\w .-]{1,60}$/.test(name)) throw new Error('Invalid app name');
    const exe = name.toLowerCase().endsWith('.exe') ? name : `${name}.exe`;
    await new Promise((resolve, reject) => execFile('taskkill.exe', ['/IM', exe], { windowsHide: true }, (e, out, errOut) => (e ? reject(new Error(errOut || e.message)) : resolve())));
    return { closed: name };
  }

  return {
    foreground: async () => { const [proc, title = '', hwnd] = (await send('fg')).split('\t'); return { process: proc, title, hwnd: Number(hwnd), ...describeWindow(proc, title) }; },
    activate: (hwnd) => send('activate', hwnd),
    elements: async () => JSON.parse((await send('elements')) || '[]'),
    readText: () => send('readtext'),
    invoke: (i) => send('invoke', i),
    // One command per line: newlines in typed text become spaces.
    setText: (i, text) => send('settext', `${i}\x1f${String(text).replace(/[\r\n]+/g, ' ')}`),
    /** Type into whatever has the keyboard focus. */
    type: (text) => send('type', String(text).replace(/[\r\n]+/g, ' ')),
    click: (x, y, button = 'left') => send('click', `${Math.round(x)},${Math.round(y)},${button}`),
    drag: (x1, y1, x2, y2) => send('drag', [x1, y1, x2, y2].map(Math.round).join(',')),
    /** What is under the mouse pointer: { kind, name, value, hint }. */
    async atPointer() { const [kind = '', name = '', value = '', hint = ''] = String(await send('atpoint')).split('\t'); return { kind, name, value, hint }; },
    // Head mouse: many moves a second, so no reply is awaited (id 0 is never pending).
    move(x, y) { if (!child) start(); child.stdin.write(`0\tmove\t${Math.round(x)},${Math.round(y)}\n`); },
    clickHere: (button = 'left') => send('clickhere', button),
    keys: (seq) => send('keys', seq),
    /** Virtual-key codes pressed together, e.g. Win + Plus for the Magnifier. */
    chord: (...vks) => send('chord', vks.join(',')),
    scroll: (amount) => send('scroll', amount),
    key: (k) => send('key', MEDIA_KEYS[k] ?? k),
    volume: (level) => send('vol', level ?? '').then(Number),
    mute: (on) => send('mute', on ? '1' : '0'),
    brightness: (level) => send('bright', level ?? '').then(Number),
    minimizeForeground: () => send('min'),
    lock: () => send('lock'),
    /** Windows dark mode for apps and the taskbar (the user's own setting, HKCU). */
    async darkMode(on) {
      const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize';
      for (const name of ['AppsUseLightTheme', 'SystemUsesLightTheme']) await quiet('reg.exe', ['add', key, '/v', name, '/t', 'REG_DWORD', '/d', on ? '0' : '1', '/f']);
    },
    openApp, power, closeApp, startUri, shortcuts,
    /** A website in the user's Chrome profile (signed in to Gmail, ChatGPT…), else the default browser. */
    async openUrl(url) { if (!(await startChrome([url]))) await shell.openExternal(url); }, storeApps,
    stop: () => child?.kill(),
  };
}
