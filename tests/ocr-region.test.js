const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
if(process.platform==='win32'){
 const source=fs.readFileSync(path.join(__dirname,'../desktop/automation/windows-helper.ps1'),'utf8');
 const csharp=source.split("Add-Type @'\n")[1]?.split("\n'@ -ReferencedAssemblies")[0]||source.replace(/\r/g,'').split("Add-Type @'\n")[1].split("\n'@ -ReferencedAssemblies")[0];
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pitch-region-test-')),file=path.join(dir,'region.ps1');
 const script=`
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing,System.Windows.Forms
$code=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(csharp).toString('base64')}'))
Add-Type $code -ReferencedAssemblies System.Drawing,System.Windows.Forms
function Mouse($f,$method,$x,$y,$button='Left'){
 $event=New-Object Windows.Forms.MouseEventArgs([Windows.Forms.MouseButtons]::$button,1,$x,$y,0)
 $f.GetType().GetMethod($method,[Reflection.BindingFlags]'Instance,NonPublic').Invoke($f,@($event.PSObject.BaseObject))|Out-Null
}
# Test the form's event handlers without showing a window or injecting desktop input.
$f=New-Object PitchRegionPicker
try{
 $f.Location=New-Object Drawing.Point(-1600,100)
 Mouse $f OnMouseDown 1000 700
 Mouse $f OnMouseUp 100 100
 $r=$f.Selection
 if($r.X -ne -1500 -or $r.Y -ne 200 -or $r.Width -ne 900 -or $r.Height -ne 600){throw 'Reverse drag / negative monitor origin failed'}
 if($f.DialogResult -ne 'OK'){throw 'Valid drag not accepted'}
}finally{$f.Dispose()}
$f=New-Object PitchRegionPicker
try{
 Mouse $f OnMouseDown 10 10
 Mouse $f OnMouseUp 50 50
 if($f.DialogResult -eq 'OK'){throw 'Undersized region accepted'}
 Mouse $f OnMouseDown 20 20 Right
 if($f.DialogResult -ne 'Cancel'){throw 'Right-click did not cancel'}
}finally{$f.Dispose()}
$f=New-Object PitchRegionPicker
try{
 $key=New-Object Windows.Forms.KeyEventArgs([Windows.Forms.Keys]::Escape)
 $f.GetType().GetMethod('OnKeyDown',[Reflection.BindingFlags]'Instance,NonPublic').Invoke($f,@($key.PSObject.BaseObject))|Out-Null
 if($f.DialogResult -ne 'Cancel'){throw 'Escape did not cancel'}
}finally{$f.Dispose()}
Write-Output 'Screen region drag, negative origin, minimum size and cancellation passed'
`;
 fs.writeFileSync(file,script);
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',file],{encoding:'utf8',windowsHide:true,timeout:20000});
 assert.equal(result.status,0,result.stderr||String(result.error));console.log(result.stdout.trim());
}
