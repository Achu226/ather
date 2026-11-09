# Checks start.bat picks the right AI models for different laptops: powershell -File scripts/test-share-plan.ps1
$ast = [System.Management.Automation.Language.Parser]::ParseInput([IO.File]::ReadAllText((Join-Path $PSScriptRoot "..\share\start.bat")), [ref]$null, [ref]$null)
$SIZES = @{ 'qwen3.5:2b' = 2.7; 'qwen3.5:4b' = 3.4; 'qwen3.5:9b' = 6.6; 'qwen2.5-coder:7b' = 4.7; 'nomic-embed-text' = 0.3 }
$fn = $ast.FindAll({ $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq 'Get-Plan' }, $true)[0]
. ([scriptblock]::Create($fn.Extent.Text))
$cases = @(
  @{ s = @{ RamGB = 8; VramGB = 0; FreeGB = 50 }; tier = 'Lite'; n = 2 },
  @{ s = @{ RamGB = 16; VramGB = 2; FreeGB = 50 }; tier = 'Lite'; n = 2 },
  @{ s = @{ RamGB = 16; VramGB = 4; FreeGB = 50 }; tier = 'Standard'; n = 2 },
  @{ s = @{ RamGB = 16; VramGB = 8; FreeGB = 50 }; tier = 'Full'; n = 4 },
  @{ s = @{ RamGB = 16; VramGB = 8; FreeGB = 26 }; tier = 'Full'; n = 3 },
  @{ s = @{ RamGB = 16; VramGB = 8; FreeGB = 18 }; tier = 'Full'; n = 2 }
)
$bad = 0
foreach ($c in $cases) { $p = Get-Plan ([pscustomobject]$c.s); $ok = $p.Tier -eq $c.tier -and $p.Models.Count -eq $c.n; if (-not $ok) { $bad++ }; "{0} {1} {2}" -f $(if ($ok) {'ok  '} else {'FAIL'}), $p.Tier, ($p.Models -join ',') }
exit $bad
