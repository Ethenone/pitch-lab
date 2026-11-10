# UTF-8 JSON-lines transport. This helper only exposes the operations below.
$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Drawing,System.Windows.Forms,System.Runtime.WindowsRuntime
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Drawing;
using System.Windows.Forms;
public class PitchRegionPicker : Form {
 public Rectangle Selection;
 private Point anchor,current;
 private bool dragging;
 private string hint="\u62d6\u52a8\u6846\u9009\u6e38\u620f\u5185\u5bb9\uff08\u4e0d\u542b\u767d\u8272\u6807\u9898\u680f\uff09\uff0c\u677e\u5f00\u786e\u8ba4\uff1bEsc / \u53f3\u952e\u53d6\u6d88";
 private Timer timeout;
 public PitchRegionPicker() {
  FormBorderStyle=FormBorderStyle.None;StartPosition=FormStartPosition.Manual;
  AutoScaleMode=AutoScaleMode.None;Bounds=SystemInformation.VirtualScreen;
  TopMost=true;ShowInTaskbar=false;BackColor=Color.Black;Opacity=0.45;
  Cursor=Cursors.Cross;DoubleBuffered=true;KeyPreview=true;
  timeout=new Timer();timeout.Interval=120000;timeout.Tick+=(s,e)=>Cancel();timeout.Start();
 }
 private void Cancel(){DialogResult=DialogResult.Cancel;Close();}
 protected override void OnKeyDown(KeyEventArgs e){if(e.KeyCode==Keys.Escape)Cancel();base.OnKeyDown(e);}
 protected override void OnMouseDown(MouseEventArgs e){
  if(e.Button==MouseButtons.Right){Cancel();return;}
  if(e.Button!=MouseButtons.Left)return;
  anchor=e.Location;current=anchor;dragging=true;Capture=true;Invalidate();
 }
 protected override void OnMouseMove(MouseEventArgs e){if(dragging){current=e.Location;Invalidate();}}
 private Rectangle Box(){return Rectangle.FromLTRB(Math.Min(anchor.X,current.X),Math.Min(anchor.Y,current.Y),Math.Max(anchor.X,current.X),Math.Max(anchor.Y,current.Y));}
 protected override void OnMouseUp(MouseEventArgs e){
  if(!dragging||e.Button!=MouseButtons.Left)return;
  current=e.Location;dragging=false;Capture=false;var r=Box();
  if(r.Width<600||r.Height<350){hint="\u533a\u57df\u592a\u5c0f\uff0c\u8bf7\u91cd\u65b0\u6846\u9009\u5b8c\u6574\u6e38\u620f\u5185\u5bb9\uff08\u81f3\u5c11 600 \u00d7 350\uff09\u3002Esc \u53d6\u6d88";Invalidate();return;}
  r.Offset(Left,Top);Selection=r;DialogResult=DialogResult.OK;Close();
 }
 protected override void OnPaint(PaintEventArgs e){
  base.OnPaint(e);using(var pen=new Pen(Color.Lime,3)){if(dragging)e.Graphics.DrawRectangle(pen,Box());}
  var cursor=PointToClient(Control.MousePosition);
  int x=Math.Max(15,Math.Min(Width-900,cursor.X+20)),y=Math.Max(15,Math.Min(Height-60,cursor.Y+25));
  using(var font=new Font("Segoe UI",15)){e.Graphics.DrawString(hint,font,Brushes.White,x,y);}
 }
 protected override void Dispose(bool disposing){if(disposing&&timeout!=null)timeout.Dispose();base.Dispose(disposing);}
}
public class PitchNative {
 public static void Contrast(System.Drawing.Bitmap bitmap, bool invert, int threshold) {
  var r=new System.Drawing.Rectangle(0,0,bitmap.Width,bitmap.Height);
  var d=bitmap.LockBits(r,System.Drawing.Imaging.ImageLockMode.ReadWrite,System.Drawing.Imaging.PixelFormat.Format32bppArgb);
  try {var bytes=new byte[d.Stride*d.Height];Marshal.Copy(d.Scan0,bytes,0,bytes.Length);
   for(int i=0;i<bytes.Length;i+=4){int v=(bytes[i]*11+bytes[i+1]*59+bytes[i+2]*30)/100;if(invert)v=255-v;if(threshold>0)v=v>=threshold?255:0;bytes[i]=bytes[i+1]=bytes[i+2]=(byte)v;}
   Marshal.Copy(bytes,0,d.Scan0,bytes.Length);
  }finally{bitmap.UnlockBits(d);}
 }
 [StructLayout(LayoutKind.Sequential)] public struct Point {public int X,Y;}
 [StructLayout(LayoutKind.Sequential)] public struct Rect {public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point p);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint flag);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,int data,UIntPtr extra);
}
'@ -ReferencedAssemblies System.Drawing,System.Windows.Forms
[PitchNative]::SetProcessDPIAware() | Out-Null
$null=[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime]
$null=[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.SoftwareBitmap,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
$null=[Windows.Storage.Streams.IRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]
$asTask=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
function Await($op,$type){$task=$asTask.MakeGenericMethod($type).Invoke($null,@($op));$task.GetAwaiter().GetResult()}
$engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language('zh-Hans-CN')))
function OcrFile($filePath){
 if(-not $engine){throw 'Chinese OCR language is not installed. Install Simplified Chinese OCR in Windows language settings.'}
 $file=Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($filePath)) ([Windows.Storage.StorageFile])
 $stream=Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
 try{
  $decoder=Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap=Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  try{
   $activeEngine=$engine
   if($script:ocrLanguage){$alternate=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language($script:ocrLanguage)));if($alternate){$activeEngine=$alternate}}
   $result=Await ($activeEngine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
   $lines=@(foreach($line in $result.Lines){
    $words=@(foreach($word in $line.Words){$r=$word.BoundingRect;@{text=$word.Text;x=$r.X;y=$r.Y;width=$r.Width;height=$r.Height}})
    if($words.Count){$left=($words.x|Measure-Object -Minimum).Minimum;$top=($words.y|Measure-Object -Minimum).Minimum;$right=($words|ForEach-Object {$_.x+$_.width}|Measure-Object -Maximum).Maximum;$bottom=($words|ForEach-Object {$_.y+$_.height}|Measure-Object -Maximum).Maximum;@{text=$line.Text;x=$left;y=$top;width=$right-$left;height=$bottom-$top;words=$words}}
   })
   @{text=$result.Text;lines=$lines;width=$bitmap.PixelWidth;height=$bitmap.PixelHeight}
  }finally{$bitmap.Dispose()}
 }finally{$stream.Dispose()}
}
function WindowRect($handle){$r=New-Object PitchNative+Rect;[PitchNative]::GetWindowRect([IntPtr]([long]$handle),[ref]$r)|Out-Null;@{x=$r.Left;y=$r.Top;width=$r.Right-$r.Left;height=$r.Bottom-$r.Top}}
function ReadImage($request){
 if(-not $request.crop -and -not $request.scale -and -not $request.invert -and -not $request.threshold){return OcrFile $request.path}
 $source=[Drawing.Bitmap]::FromFile($request.path)
 $temporary=[IO.Path]::Combine([IO.Path]::GetTempPath(),[Guid]::NewGuid().ToString()+'.png')
 try{
  $crop=$request.crop;if(-not $crop){$crop=@{x=0;y=0;width=$source.Width;height=$source.Height}}
  $scale=if($request.scale){[double]$request.scale}else{1.0}
  $scale=[Math]::Min($scale,2500.0/[Math]::Max($crop.width,$crop.height))
  $bitmap=New-Object Drawing.Bitmap([int]($crop.width*$scale),[int]($crop.height*$scale))
  $g=[Drawing.Graphics]::FromImage($bitmap)
  try{
   $g.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
   $g.DrawImage($source,(New-Object Drawing.Rectangle(0,0,$bitmap.Width,$bitmap.Height)),[single]$crop.x,[single]$crop.y,[single]$crop.width,[single]$crop.height,[Drawing.GraphicsUnit]::Pixel)
   $g.Dispose();$g=$null
   [PitchNative]::Contrast($bitmap,[bool]$request.invert,[int]$request.threshold)
   $bitmap.Save($temporary,[Drawing.Imaging.ImageFormat]::Png)
   $result=OcrFile $temporary
   foreach($line in $result.lines){foreach($box in @($line)+@($line.words)){$box.x=$box.x/$scale+$crop.x;$box.y=$box.y/$scale+$crop.y;$box.width=$box.width/$scale;$box.height=$box.height/$scale}}
   $result.width=$source.Width;$result.height=$source.Height;return $result
  }finally{if($g){$g.Dispose()};$bitmap.Dispose()}
 }finally{$source.Dispose();if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary}}
}
function CheckTarget($request){
 $h=[IntPtr]([long]$request.handle)
 if(-not [PitchNative]::IsWindow($h) -or [PitchNative]::GetForegroundWindow() -ne $h){throw 'Target lost focus; stopped before clicking.'}
 $r=WindowRect $request.handle
 if($request.window -and ($r.x -ne $request.window.x -or $r.y -ne $request.window.y -or $r.width -ne $request.window.width -or $r.height -ne $request.window.height)){throw 'Target window moved or resized; recalibrate.'}
 if($request.x -ne $null){
  $p=New-Object PitchNative+Point;$p.X=[int]$request.x;$p.Y=[int]$request.y
  if([PitchNative]::GetAncestor([PitchNative]::WindowFromPoint($p),2) -ne $h){throw 'Target point is covered by another window.'}
 }
}
function FocusTarget($request){
 $h=[IntPtr]([long]$request.handle)
 if(-not [PitchNative]::IsWindow($h)){throw 'Game window closed; recalibrate.'}
 # Windows can deny foreground activation. Wait for activation or a user's title-bar
 # click only at startup; never steal focus back during collection.
 if([PitchNative]::GetForegroundWindow() -ne $h){[PitchNative]::SetForegroundWindow($h)|Out-Null}
 $watch=[Diagnostics.Stopwatch]::StartNew()
 while([PitchNative]::GetForegroundWindow() -ne $h -and $watch.ElapsedMilliseconds -lt 12000){
  if(-not [PitchNative]::IsWindow($h)){throw 'Game window closed; recalibrate.'}
  Start-Sleep -Milliseconds 100
 }
 if([PitchNative]::GetForegroundWindow() -ne $h){throw 'Game activation timed out; click the game title bar within 12 seconds after retrying.'}
 CheckTarget $request
 @{ok=$true}
}
function Capture($request){
 if($request.handle){CheckTarget $request}
 $r=$request.rect
 if(-not $r){$v=[Windows.Forms.SystemInformation]::VirtualScreen;$r=@{x=$v.X;y=$v.Y;width=$v.Width;height=$v.Height}}
 if($r.width -le 0 -or $r.height -le 0 -or $r.width -gt 12000 -or $r.height -gt 8000){throw 'Invalid capture rectangle'}
 $bmp=New-Object Drawing.Bitmap([int]$r.width,[int]$r.height)
 $graphics=[Drawing.Graphics]::FromImage($bmp)
 try{
  $graphics.CopyFromScreen([int]$r.x,[int]$r.y,0,0,$bmp.Size)
  if($request.path){$bmp.Save($request.path,[Drawing.Imaging.ImageFormat]::Png);return @{path=$request.path;rect=$r}}
  $memory=New-Object IO.MemoryStream
  try{$bmp.Save($memory,[Drawing.Imaging.ImageFormat]::Png);@{image='data:image/png;base64,'+[Convert]::ToBase64String($memory.ToArray());rect=$r}}finally{$memory.Dispose()}
 }finally{$graphics.Dispose();$bmp.Dispose()}
}
while($null -ne ($line=[Console]::ReadLine())){
 $request=$null
 try{
  $request=$line|ConvertFrom-Json
  $value=switch($request.op){
   'health' {@{languages=@([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages|ForEach-Object {$_.LanguageTag});ready=($null -ne $engine)}}
   'ocr' {$script:ocrLanguage=$request.language;ReadImage $request}
   'capture' {Capture $request}
   'selectRegion' {
    $picker=New-Object PitchRegionPicker
    try{
     $answer=$picker.ShowDialog()
     if($answer -eq [Windows.Forms.DialogResult]::OK){$r=$picker.Selection;$picked=@{x=$r.X;y=$r.Y;width=$r.Width;height=$r.Height}}else{$picked=$null}
    }finally{$picker.Dispose()}
    if($picked){Start-Sleep -Milliseconds 200;Capture @{rect=$picked}}else{@{cancelled=$true}}
   }
   'bind' {$p=New-Object PitchNative+Point;$p.X=[int]$request.x;$p.Y=[int]$request.y;$h=[PitchNative]::GetAncestor([PitchNative]::WindowFromPoint($p),2);@{handle=$h.ToInt64().ToString();window=(WindowRect $h.ToInt64())}}
   'focus' {FocusTarget $request}
   'click' {CheckTarget $request;[PitchNative]::SetCursorPos([int]$request.x,[int]$request.y)|Out-Null;[PitchNative]::mouse_event(2,0,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 60;[PitchNative]::mouse_event(4,0,0,0,[UIntPtr]::Zero);@{ok=$true}}
   'scroll' {CheckTarget $request;[PitchNative]::SetCursorPos([int]$request.x,[int]$request.y)|Out-Null;[PitchNative]::mouse_event(2048,0,0,[int]$request.delta,[UIntPtr]::Zero);@{ok=$true}}
   'drag' {
    CheckTarget $request
    $end=@{handle=$request.handle;window=$request.window;x=$request.toX;y=$request.toY};CheckTarget $end
    [PitchNative]::SetCursorPos([int]$request.x,[int]$request.y)|Out-Null
    [PitchNative]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
    try{for($step=1;$step -le 16;$step++){CheckTarget @{handle=$request.handle;window=$request.window};$x=[int]($request.x+($request.toX-$request.x)*$step/16);$y=[int]($request.y+($request.toY-$request.y)*$step/16);[PitchNative]::SetCursorPos($x,$y)|Out-Null;Start-Sleep -Milliseconds 20}}
    finally{[PitchNative]::mouse_event(4,0,0,0,[UIntPtr]::Zero)}
    @{ok=$true}
   }
   default {throw 'Unsupported operation'}
  }
  [Console]::WriteLine((@{id=$request.id;ok=$true;value=$value}|ConvertTo-Json -Depth 12 -Compress))
 }catch{[Console]::WriteLine((@{id=$request.id;ok=$false;error=$_.Exception.Message}|ConvertTo-Json -Compress))}
}
