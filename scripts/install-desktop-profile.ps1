#Requires -Version 5.1
<#
.SYNOPSIS
    把 dsh-pet-roxy 挂进指定的 DSH profile（默认 desktop）。

.DESCRIPTION
    两种挂载模式：

    Package（默认，推荐）
      在 <profile>\node_modules 下建一个目录联接（junction）指向本仓库，patch 层写包名
      name: 'dsh-pet-roxy'。

      为什么必须用包名：harness 的 client 扫描器靠 exactPackageSpecifier() 从 loader 条目的
      name 反推包名，再读该包的 package.json 找 dsh.client 声明。file:// URL 这类带 scheme 的
      说明符会让它返回 undefined，于是 dsh.client 永远扫不到，React 客户端半侧也就不会加载。

      全程不跑 pnpm：junction 是纯文件系统操作，不触发依赖解析，因此不会把 profiles 里
      hoisted 的旧版 @deepseek-ai/* 拉进本 profile 的解析路径。

    File（兜底）
      patch 层写 file:// URL 指向 lib/index.js。完全不碰 node_modules，但如上所述 client
      半侧不会被加载，只剩 webserver/index-inject 注入式。

    两种模式都保留注入式作为显示兜底，所以即使 client 半侧加载失败，宠物依然会出现。

.PARAMETER Profile
    目标 profile 名，默认 desktop（官方 Electron 桌面版用的就是这个）。

.PARAMETER DshHome
    DSH_HOME 目录；默认取 $env:DSH_HOME，再退回 ~\.dsh。

.PARAMETER Mode
    Package（默认）或 File。

.PARAMETER Uninstall
    移除 patch 条目与 junction，恢复到写入前的状态。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\install-desktop-profile.ps1 -WhatIf
    预览将要做的改动。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\install-desktop-profile.ps1
    用 Package 模式安装。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\install-desktop-profile.ps1 -Mode File
    退回旧的 file:// 方式。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\install-desktop-profile.ps1 -Uninstall
    卸载。

.NOTES
    改完必须重启 DSH：Electron 桌面版要完全退出再启动，刷新浏览器无效。
    宿主侧（lib/index.js）改动同样需要重启；只有 lib/client.js 能靠刷新生效。
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$Profile = 'desktop',
    [string]$DshHome,
    [ValidateSet('Package', 'File')]
    [string]$Mode = 'Package',
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$PACKAGE_NAME = 'dsh-pet-roxy'
$BEGIN_MARKER = '# >>> dsh-pet-roxy (managed by scripts/install-desktop-profile.ps1) >>>'
$END_MARKER   = '# <<< dsh-pet-roxy <<<'

# ---------------------------------------------------------------------------
# 定位仓库与 DSH_HOME
# ---------------------------------------------------------------------------
$repoRoot   = Split-Path -Parent $PSScriptRoot
$libPath    = Join-Path $repoRoot 'lib\index.js'
$clientPath = Join-Path $repoRoot 'lib\client.js'
$widgetPath = Join-Path $repoRoot 'client\roxy-widget.js'

if (-not (Test-Path -LiteralPath $libPath))    { throw "找不到宿主入口: $libPath" }
if (-not (Test-Path -LiteralPath $widgetPath)) { throw "找不到页面脚本: $widgetPath" }

if ([string]::IsNullOrWhiteSpace($DshHome)) {
    if ($env:DSH_HOME) { $DshHome = $env:DSH_HOME } else { $DshHome = Join-Path $env:USERPROFILE '.dsh' }
}

$profilesDir = Join-Path $DshHome 'profiles'
$profileDir  = Join-Path $profilesDir $Profile
$patchPath   = Join-Path $profileDir 'cordis.patch.yml'
$nodeModules = Join-Path $profileDir 'node_modules'
$linkPath    = Join-Path $nodeModules $PACKAGE_NAME

if (-not (Test-Path -LiteralPath $patchPath)) {
    $available = (Get-ChildItem -LiteralPath $profilesDir -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name) -join ', '
    throw ("找不到 profile patch 文件: {0}`n可用 profile: {1}" -f $patchPath, $available)
}

$fileUrl = 'file:///' + ($libPath -replace '\\', '/')
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# ---------------------------------------------------------------------------
# 工具
# ---------------------------------------------------------------------------
function Get-DshLink {
    # 只认"指向本仓库的 junction"，避免误删用户自己的东西
    if (-not (Test-Path -LiteralPath $linkPath)) { return $null }
    $item = Get-Item -LiteralPath $linkPath -Force -ErrorAction SilentlyContinue
    if ($null -eq $item) { return $null }
    if ($item.LinkType -ne 'Junction') { return $null }
    $target = @($item.Target)[0]
    if ([string]::IsNullOrWhiteSpace($target)) { return $null }
    if ($target.TrimEnd('\') -ieq $repoRoot.TrimEnd('\')) { return $item }
    return $null
}

function Remove-DshLink {
    # 只删链接本身。rmdir 对 junction 不会递归进目标；
    # Remove-Item -Recurse 在老版本 PowerShell 上会连目标内容一起删，绝对不能用。
    if (Test-Path -LiteralPath $linkPath) {
        & cmd /c rmdir "$linkPath" 2>&1 | Out-Null
    }
}

function Read-PatchText {
    $text = [System.IO.File]::ReadAllText($patchPath)
    $text = $text -replace "^\uFEFF", ''
    return ($text -replace "`r`n", "`n")
}

function Get-BlockPattern {
    return '(?ms)^' + [regex]::Escape($BEGIN_MARKER) + '.*?^' + [regex]::Escape($END_MARKER) + '\n?'
}

function Remove-Block {
    param([string]$Text)
    return (([regex]::Replace($Text, (Get-BlockPattern), '')).TrimEnd("`n") + "`n")
}

function Test-HostImport {
    # 从 profile 目录出发，按 host 运行时的方式解析包名
    Push-Location $profileDir
    try {
        $out = & node --input-type=module -e "const m = await import('$PACKAGE_NAME'); console.log('EXPORTS:' + Object.keys(m).sort().join(','))" 2>&1 | Out-String
    } finally {
        Pop-Location
    }
    $out = $out.Trim()
    if ($out -match '^EXPORTS:.*\bapply\b.*\binject\b') { return 'ok' }
    return $out
}

function Test-PluginEntry {
    param([string]$Url)
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { return 'skip' }
    $script = "import('" + $Url + "').then(m => { console.log('EXPORTS:' + Object.keys(m).sort().join(',')) }).catch(e => { console.log('ERROR:' + e.message) })"
    $out = (& node -e $script 2>&1 | Out-String).Trim()
    if ($out -match '^EXPORTS:.*\bapply\b') { return 'ok' }
    return $out
}

# ---------------------------------------------------------------------------
# 卸载
# ---------------------------------------------------------------------------
if ($Uninstall) {
    $text = Read-PatchText
    $hasBlock = [regex]::IsMatch($text, (Get-BlockPattern))
    $link = Get-DshLink

    if (-not $hasBlock -and $null -eq $link) {
        Write-Host "[skip] 没有找到 dsh-pet-roxy 的挂载痕迹，无需卸载。"
        return
    }
    if (-not $PSCmdlet.ShouldProcess($patchPath, '移除 pet-roxy 挂载')) { return }

    $backup = "$patchPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item -LiteralPath $patchPath -Destination $backup -Force

    [System.IO.File]::WriteAllText($patchPath, (Remove-Block -Text $text), $utf8NoBom)
    if ($null -ne $link) { Remove-DshLink }

    Write-Host "[ok] 已移除 pet-roxy 挂载（patch 条目 + junction）。"
    Write-Host "     备份: $backup"
    Write-Host "     重启 DSH 后洛琪希即不再出现。"
    return
}

# ---------------------------------------------------------------------------
# 安装 / 切换模式
# ---------------------------------------------------------------------------
$text = Read-PatchText
$existingLink = Get-DshLink

# 自检放在改动之前：不过就把用户的 profile 原样留着
$clientSize = 0
if ($Mode -eq 'Package') {
    if (Test-Path -LiteralPath $clientPath) {
        $clientSize = [math]::Round((Get-Item -LiteralPath $clientPath).Length / 1KB)
    } else {
        Write-Warning "lib\client.js 不存在 —— harness 会扫到 dsh.client 却取不到 bundle，可能让前端启动失败。先跑 npm run build。"
    }
} else {
    $probe = Test-PluginEntry -Url $fileUrl
    if ($probe -ne 'ok' -and $probe -ne 'skip') {
        throw ("file:// 入口自检失败，已中止。`n  URL : {0}`n  结果: {1}" -f $fileUrl, $probe)
    }
}

if (-not $PSCmdlet.ShouldProcess($profileDir, "以 $Mode 模式挂载 pet-roxy")) { return }

$backup = "$patchPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -LiteralPath $patchPath -Destination $backup -Force

# --- 1) junction ---
if ($Mode -eq 'Package') {
    New-Item -ItemType Directory -Path $nodeModules -Force | Out-Null
    if ($null -ne $existingLink) {
        Write-Host "[skip] junction 已存在且指向本仓库。"
    } else {
        if (Test-Path -LiteralPath $linkPath) { Remove-DshLink } # 指向别处的旧链接
        New-Item -ItemType Junction -Path $linkPath -Target $repoRoot | Out-Null
        Write-Host "[ok] 已建 junction: $linkPath -> $repoRoot"
    }
} elseif ($null -ne $existingLink) {
    Remove-DshLink
    Write-Host "[ok] 已移除 junction（File 模式不需要）。"
}

# --- 2) patch 条目 ---
$entryName = if ($Mode -eq 'Package') { $PACKAGE_NAME } else { $fileUrl }
$blockLines = @(
    $BEGIN_MARKER,
    '- insert:',
    '    - id: pet-roxy',
    ("      name: '{0}'" -f $entryName),
    $END_MARKER
)

$body = (Remove-Block -Text $text).TrimEnd("`n")
if ($body.Length -gt 0) { $body += "`n`n" }
[System.IO.File]::WriteAllText($patchPath, $body + ($blockLines -join "`n") + "`n", $utf8NoBom)

# --- 3) 装完自检 ---
if ($Mode -eq 'Package') {
    $probe = Test-HostImport
    if ($probe -eq 'ok') {
        Write-Host "[ok] 已写入 patch 条目（包名解析自检通过）。"
    } else {
        Write-Warning "包名解析自检未通过，harness 可能加载不到宿主半侧：`n  $probe"
    }
} else {
    Write-Host "[ok] 已写入 patch 条目（file:// 方式）。"
}

Write-Host "     profile : $Profile"
Write-Host "     模式    : $Mode"
Write-Host "     配置    : $patchPath"
Write-Host "     入口    : $entryName"
if ($Mode -eq 'Package') { Write-Host "     client  : lib\client.js ($clientSize KB)" }
Write-Host "     备份    : $backup"
Write-Host ""
Write-Host "下一步：完全退出并重启 DSH（Electron 桌面版不能只刷新页面）。"
Write-Host "验证  ：右下角出现洛琪希；DevTools 里 window.__dshPetRoxyClient === true 表示 client 半侧也加载了"
Write-Host "回滚  ：powershell -ExecutionPolicy Bypass -File scripts\install-desktop-profile.ps1 -Uninstall"
