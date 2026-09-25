#Requires -Version 5.1
<#
.SYNOPSIS
    把 dsh-pet-roxy 挂进指定的 DSH profile（默认 desktop）—— 零安装、不碰 pnpm、随时可回滚。

.DESCRIPTION
    在 <DSH_HOME>\profiles\<Profile>\cordis.patch.yml 末尾追加一条 insert 条目：

        - insert:
            - id: pet-roxy
              name: 'file:///<repo>/lib/index.js'

    用 file:// URL 直接指向本仓库的宿主入口，因此：
      * 不需要 pnpm install，不需要改 profile 的 package.json；
      * 不产生 node_modules，不会让 profiles 里 hoisted 的旧版 @deepseek-ai/*
        顶掉 harness 内置的版本；
      * 卸载只需 -Uninstall，或手工删掉带标记的块。

    为什么是 file:// URL：cordis loader 对不以 "." 开头的 name 直接走原生
    import(name)，file:// URL 由 Node 原生 ESM 解析，完全绕开 profile 的模块解析。

.PARAMETER Profile
    目标 profile 名，默认 desktop（当前 Electron 桌面版用的就是这个）。

.PARAMETER DshHome
    DSH_HOME 目录；默认取 $env:DSH_HOME，再退回 ~\.dsh。

.PARAMETER Uninstall
    移除已写入的条目，恢复到写入前的状态。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\install-desktop-profile.ps1 -WhatIf
    先预览要改什么。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\install-desktop-profile.ps1
    写入（会自动备份原文件）。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\install-desktop-profile.ps1 -Uninstall
    卸载。

.NOTES
    改完必须重启 DSH：Electron 桌面版要完全退出再启动，刷新浏览器无效。
    宿主侧（lib/index.js）改动同样需要重启；只有 client/roxy-widget.js 能靠刷新生效。
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$Profile = 'desktop',
    [string]$DshHome,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# 定位仓库与 DSH_HOME
# ---------------------------------------------------------------------------
$repoRoot   = Split-Path -Parent $PSScriptRoot
$libPath    = Join-Path $repoRoot 'lib\index.js'
$clientPath = Join-Path $repoRoot 'client\roxy-widget.js'

if (-not (Test-Path -LiteralPath $libPath))    { throw "找不到宿主入口: $libPath" }
if (-not (Test-Path -LiteralPath $clientPath)) { throw "找不到页面脚本: $clientPath" }

if ([string]::IsNullOrWhiteSpace($DshHome)) {
    if ($env:DSH_HOME) { $DshHome = $env:DSH_HOME } else { $DshHome = Join-Path $env:USERPROFILE '.dsh' }
}

$profileDir = Join-Path $DshHome ('profiles\' + $Profile)
$patchPath  = Join-Path $profileDir 'cordis.patch.yml'

if (-not (Test-Path -LiteralPath $patchPath)) {
    throw ("找不到 profile patch 文件: {0}`n可用 profile: {1}" -f $patchPath, ((Get-ChildItem -LiteralPath (Join-Path $DshHome 'profiles') -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name) -join ', '))
}

# Windows 路径 -> file:// URL（正斜杠，含空格也合法）
$fileUrl = 'file:///' + ($libPath -replace '\\', '/')

$beginMarker = '# >>> dsh-pet-roxy (managed by scripts/install-desktop-profile.ps1) >>>'
$endMarker   = '# <<< dsh-pet-roxy <<<'

$blockLines = @(
    $beginMarker,
    '- insert:',
    '    - id: pet-roxy',
    ("      name: '{0}'" -f $fileUrl),
    $endMarker
)

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# ---------------------------------------------------------------------------
# 读入并规范化（保留 LF，丢弃 BOM 干扰）
# ---------------------------------------------------------------------------
$text = [System.IO.File]::ReadAllText($patchPath)
$text = $text -replace "^\uFEFF", ''
$text = $text -replace "`r`n", "`n"

$blockPattern = '(?ms)^' + [regex]::Escape($beginMarker) + '.*?^' + [regex]::Escape($endMarker) + '\n?'
$alreadyThere = [regex]::IsMatch($text, $blockPattern)

# ---------------------------------------------------------------------------
# 自检：确认 file:// URL 能被 Node 解析出 apply/inject/name
# ---------------------------------------------------------------------------
function Test-PluginEntry {
    param([string]$Url)

    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { return 'skip' }

    $script = "import('" + $Url + "').then(m => { console.log('EXPORTS:' + Object.keys(m).sort().join(',')) }).catch(e => { console.log('ERROR:' + e.message) })"
    $out = & node -e $script 2>&1 | Out-String
    $out = $out.Trim()

    if ($out -match '^EXPORTS:apply,inject,name$') { return 'ok' }
    return $out
}

# ---------------------------------------------------------------------------
# 卸载
# ---------------------------------------------------------------------------
if ($Uninstall) {
    if (-not $alreadyThere) {
        Write-Host "[skip] $patchPath 里没有 pet-roxy 条目，无需卸载。"
        return
    }

    if (-not $PSCmdlet.ShouldProcess($patchPath, '移除 pet-roxy 条目')) { return }

    $backup = "$patchPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item -LiteralPath $patchPath -Destination $backup -Force

    $new = [regex]::Replace($text, $blockPattern, '')
    $new = $new.TrimEnd("`n") + "`n"
    [System.IO.File]::WriteAllText($patchPath, $new, $utf8NoBom)

    Write-Host "[ok] 已移除 pet-roxy 条目。"
    Write-Host "     备份: $backup"
    Write-Host "     重启 DSH 后洛琪希即不再出现。"
    return
}

# ---------------------------------------------------------------------------
# 安装 / 更新
# ---------------------------------------------------------------------------
$probe = Test-PluginEntry -Url $fileUrl
if ($probe -ne 'ok') {
    if ($probe -eq 'skip') {
        Write-Warning "PATH 里没有 node，跳过入口自检（不影响写入）。"
    } else {
        throw ("入口自检失败，插件可能无法加载，已中止写入。`n  URL : {0}`n  结果: {1}" -f $fileUrl, $probe)
    }
}

if (-not $PSCmdlet.ShouldProcess($patchPath, '写入 pet-roxy 条目')) {
    Write-Host "[preview] 将写入的块："
    $blockLines | ForEach-Object { Write-Host "    $_" }
    return
}

$backup = "$patchPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -LiteralPath $patchPath -Destination $backup -Force

$body = [regex]::Replace($text, $blockPattern, '')
$body = $body.TrimEnd("`n")
if ($body.Length -gt 0) { $body += "`n`n" } 
$new = $body + ($blockLines -join "`n") + "`n"

[System.IO.File]::WriteAllText($patchPath, $new, $utf8NoBom)

if ($alreadyThere) {
    Write-Host "[ok] 已更新 pet-roxy 条目（原条目路径已刷新）。"
} else {
    Write-Host "[ok] 已写入 pet-roxy 条目。"
}
Write-Host "     profile : $Profile"
Write-Host "     配置   : $patchPath"
Write-Host "     入口   : $fileUrl"
Write-Host "     备份   : $backup"
Write-Host ""
Write-Host "下一步：完全退出并重启 DSH（Electron 桌面版不能只刷新页面）。"
Write-Host "验证  ：curl http://127.0.0.1:19387/dsh-pet-roxy/widget.js 应返回 200"
Write-Host "回滚  ：powershell -ExecutionPolicy Bypass -File scripts\install-desktop-profile.ps1 -Uninstall"
