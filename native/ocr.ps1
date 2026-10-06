# System Windows.Media.Ocr via Windows PowerShell 5.1 / WinRT.
# Written for Windows 10/11; not yet verified on a Windows machine.
param([Parameter(Mandatory=$true)][string]$ImagePath)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$stream = $null
$bitmap = $null
try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime] | Out-Null
    [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime] | Out-Null
    [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime] | Out-Null
    [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType=WindowsRuntime] | Out-Null
    [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType=WindowsRuntime] | Out-Null
    [Windows.Media.Ocr.OcrResult, Windows.Media.Ocr, ContentType=WindowsRuntime] | Out-Null
    [Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime] | Out-Null
    $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    } | Select-Object -First 1
    function Await($operation, [Type]$type) {
        $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
        $task.GetAwaiter().GetResult()
    }
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('zh-Hans'))
    if ($null -eq $engine) { throw 'ocr_language_unavailable' }
    $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImagePath)) ([Windows.Storage.StorageFile])
    $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    if ($decoder.PixelWidth -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension -or $decoder.PixelHeight -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension) { throw 'ocr_image_too_large' }
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync([Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8, [Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied)) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    $lines = @($result.Lines | ForEach-Object {
        $words = @($_.Words)
        if ($words.Count -gt 0) {
            $left = ($words | ForEach-Object {$_.BoundingRect.X} | Measure-Object -Minimum).Minimum
            $top = ($words | ForEach-Object {$_.BoundingRect.Y} | Measure-Object -Minimum).Minimum
            $right = ($words | ForEach-Object {$_.BoundingRect.X + $_.BoundingRect.Width} | Measure-Object -Maximum).Maximum
            $bottom = ($words | ForEach-Object {$_.BoundingRect.Y + $_.BoundingRect.Height} | Measure-Object -Maximum).Maximum
            @{text=$_.Text; x=$left/$bitmap.PixelWidth; y=$top/$bitmap.PixelHeight;
              w=($right-$left)/$bitmap.PixelWidth; h=($bottom-$top)/$bitmap.PixelHeight}
        }
    })
    ConvertTo-Json -InputObject $lines -Depth 4 -Compress
} catch {
    $code = if ($_.Exception.Message -match '^ocr_[a-z_]+$') {$_.Exception.Message} else {'ocr_windows_unavailable'}
    ConvertTo-Json -InputObject @{error=$code} -Compress
    exit 1
} finally {
    if ($null -ne $bitmap) {$bitmap.Dispose()}
    if ($null -ne $stream) {$stream.Dispose()}
}
