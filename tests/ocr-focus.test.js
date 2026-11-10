const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
if(process.platform==='win32'){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pitch-focus-test-'));
 const helper=fs.readFileSync(path.join(__dirname,'../desktop/automation/windows-helper.ps1')).toString('base64');
 // Execute the production focus/guard functions against a simulated native API.
 // No real windows are focused or clicked by this test.
 const script=`
$ErrorActionPreference='Stop'
Add-Type @'
using System;
public class PitchNative {
 public static int Polls=0,Requests=0;
 public static bool Valid=true;
 public static bool IsWindow(IntPtr h){return Valid;}
 public static IntPtr GetForegroundWindow(){return ++Polls >= 4 ? new IntPtr(1) : IntPtr.Zero;}
 public static bool SetForegroundWindow(IntPtr h){Requests++;return false;}
}
'@
$source=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${helper}'))
$tokens=$null;$parseErrors=$null
$ast=[Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw 'Helper has syntax errors'}
foreach($name in @('CheckTarget','FocusTarget')){
 $function=$ast.FindAll({param($a) $a -is [Management.Automation.Language.FunctionDefinitionAst] -and $a.Name -eq $name},$true)[0]
 . ([scriptblock]::Create($function.Extent.Text))
}
function WindowRect($handle){@{x=0;y=0;width=800;height=450}}
$result=FocusTarget @{handle='1'}
if(-not $result.ok -or [PitchNative]::Requests -ne 1 -or [PitchNative]::Polls -lt 4){throw 'Delayed focus was not awaited'}
$failed=$false
try{FocusTarget @{handle='1';window=@{x=10;y=0;width=800;height=450}}}catch{$failed=$_.Exception.Message -like '*moved or resized*'}
if(-not $failed){throw 'Geometry guard was bypassed'}
[PitchNative]::Valid=$false;$failed=$false
try{FocusTarget @{handle='1'}}catch{$failed=$_.Exception.Message -like '*closed*'}
if(-not $failed){throw 'Closed window was not rejected'}
Write-Output 'Delayed activation and window guards passed'
`;
 const file=path.join(directory,'test.ps1');fs.writeFileSync(file,script);
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',file],{encoding:'utf8',windowsHide:true,timeout:20000});
 assert.equal(result.status,0,result.stderr||String(result.error));console.log(result.stdout.trim());
}
