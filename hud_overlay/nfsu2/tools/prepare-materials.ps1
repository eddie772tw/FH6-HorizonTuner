# Offline asset preparation. Run with Windows PowerShell 5.1 (System.Drawing).
param(
    [Parameter(Mandatory=$true)][string]$ResearchRoot,
    [Parameter(Mandatory=$true)][string]$SourceAssets,
    [Parameter(Mandatory=$true)][string]$Output
)
$ResearchRoot = (Resolve-Path -LiteralPath $ResearchRoot).Path
$SourceAssets = (Resolve-Path -LiteralPath $SourceAssets).Path
$Output = [System.IO.Path]::GetFullPath($Output)
if ($Output -eq $SourceAssets -or $Output.StartsWith($SourceAssets + [System.IO.Path]::DirectorySeparatorChar)) {
    throw 'Output must be a separate staging directory; preserve the original source assets.'
}
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Path $Output -Force | Out-Null
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.IO;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class NfsMaterialAudit {
 static string Root;
 const string Host="d3d11_shader_host.dll";
 [DllImport(Host, CallingConvention=CallingConvention.Cdecl)] static extern int init_d3d11(int w,int h,byte[] vs,int size);
 [DllImport(Host, CallingConvention=CallingConvention.Cdecl)] static extern IntPtr create_ps(byte[] data,int size);
 [DllImport(Host, CallingConvention=CallingConvention.Cdecl)] static extern IntPtr create_dds_srv(byte[] data,int size);
 [DllImport(Host, CallingConvention=CallingConvention.Cdecl)] static extern IntPtr create_rgba_srv(byte[] data,int w,int h);
 [DllImport(Host, CallingConvention=CallingConvention.Cdecl)] static extern int render_pass(IntPtr ps,byte[] cb,int cbsize,IntPtr[] srvs,int count,float r,float g,float b,float a,int clear,byte[] output);
 const int W=1920,H=1080;
 static int[] ids={262,254,255,256,264,265,304,305,306,307,308,309,310,311,312,313,314,315,317,318,319,320,321,322,323,400,401,402,403,404,405,406,407,408,409,410,411,500,501,502,503,504,263,510,511,512,513,514,515,516,517,518,519,520,521,522,505,653,654,655,656,663,671,506,507,266};
 static IntPtr Texture(int id) {
   string path=Root+"/extracted_resources/dds/res_"+id+".dds";
   if(File.Exists(path)){byte[] b=File.ReadAllBytes(path);return create_dds_srv(b,b.Length);}
   using(var bmp=new Bitmap(Root+"/extracted_resources/png/res_"+id+".png"))return create_rgba_srv(Read(bmp),bmp.Width,bmp.Height);
 }
 static byte[] Read(Bitmap bitmap){
   var data=bitmap.LockBits(new Rectangle(0,0,bitmap.Width,bitmap.Height),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
   var bytes=new byte[bitmap.Width*bitmap.Height*4];
   for(int y=0;y<bitmap.Height;y++)Marshal.Copy(data.Scan0+y*data.Stride,bytes,y*bitmap.Width*4,bitmap.Width*4);
   bitmap.UnlockBits(data);
   for(int i=0;i<bytes.Length;i+=4){byte t=bytes[i];bytes[i]=bytes[i+2];bytes[i+2]=t;}return bytes;
 }
 static void Save(string file,byte[] rgba,int w,int h){
   using(var bmp=new Bitmap(w,h,PixelFormat.Format32bppArgb)){
     var bgra=(byte[])rgba.Clone();for(int i=0;i<bgra.Length;i+=4){byte t=bgra[i];bgra[i]=bgra[i+2];bgra[i+2]=t;}
     var data=bmp.LockBits(new Rectangle(0,0,w,h),ImageLockMode.WriteOnly,PixelFormat.Format32bppArgb);
     for(int y=0;y<h;y++)Marshal.Copy(bgra,y*w*4,data.Scan0+y*data.Stride,w*4);
     bmp.UnlockBits(data);bmp.Save(file,ImageFormat.Png);
   }
 }
 static byte[] Constants(int face,float rpm){
   object[] values={155f,0,rpm,8500f,4,18.1f,380000f,.78f,.78f,89f,14500,21,38,1,1f,1f,0f,60f,W,H,1,91000000+face*10000+107,220,0,0,0,16,0,0,98f,60f,1,18.5f,437000f,0};
   using(var stream=new MemoryStream()){using(var bw=new BinaryWriter(stream)){foreach(var v in values){if(v is int)bw.Write((int)v);else bw.Write((float)v);}return stream.ToArray();}}
 }
 static Rectangle Bounds(byte[] rgba,int w,int h){int x0=w,y0=h,x1=0,y1=0;for(int y=0;y<h;y++)for(int x=0;x<w;x++)if(rgba[(y*w+x)*4+3]>0){x0=Math.Min(x0,x);y0=Math.Min(y0,y);x1=Math.Max(x1,x+1);y1=Math.Max(y1,y+1);}return Rectangle.FromLTRB(x0,y0,x1,y1);}
 public static string[] Run(string research,string sources,string output){
   Root=research;var records=new System.Collections.Generic.List<string>();
   var vs=File.ReadAllBytes(Root+"/extracted_resources/shaders/res_101.dxbc");if(init_d3d11(W,H,vs,vs.Length)!=0)throw new Exception("D3D11 init failed");
   var psdata=File.ReadAllBytes(Root+"/extracted_resources/shaders/res_125.dxbc");var ps=create_ps(psdata,psdata.Length);
   var blank=create_rgba_srv(new byte[64],4,4);var srvs=new IntPtr[66];for(int i=0;i<66;i++)srvs[i]=(i<6||i==42||i==65)?blank:Texture(ids[i]);
   var full=new byte[W*H*4];var layer=new byte[W*H*4];
   for(int face=0;face<11;face++){
     srvs[61]=Texture(660+face);srvs[62]=Texture(671);var cb=Constants(face,7100);
     if(render_pass(ps,cb,cb.Length,srvs,66,0,0,0,0,1,full)!=0)throw new Exception("D3D11 render failed");
     string original=Path.Combine(sources,"nfsu2_face_"+face+".png");
     using(var bitmap=new Bitmap(original)){
       var rgba=Read(bitmap);int w=bitmap.Width,h=bitmap.Height;var sourceBounds=Bounds(rgba,w,h);var renderBounds=Bounds(full,W,H);
       int cropX=renderBounds.X-sourceBounds.X,cropY=renderBounds.Y-sourceBounds.Y;
       var alpha=new byte[w*h];for(int i=0;i<alpha.Length;i++)alpha[i]=255;
       srvs[62]=blank;
       if(render_pass(ps,cb,cb.Length,srvs,66,0,0,0,0,1,layer)!=0)throw new Exception("DDS layer render failed");
       using(var atlasBitmap=new Bitmap(Root+"/extracted_resources/previews/res_"+(660+face)+".png")){
         var atlas=Read(atlasBitmap);srvs[61]=create_rgba_srv(atlas,atlasBitmap.Width,atlasBitmap.Height);var comparison=new byte[full.Length];
         if(render_pass(ps,cb,cb.Length,srvs,66,0,0,0,0,1,comparison)!=0)throw new Exception("PNG layer render failed");
         int maxAlphaDelta=0;for(int p=3;p<layer.Length;p+=4)maxAlphaDelta=Math.Max(maxAlphaDelta,Math.Abs(layer[p]-comparison[p]));
         if(maxAlphaDelta!=0)throw new Exception("Decoded atlas alpha differs from DDS: "+maxAlphaDelta);
         // res_125.asm: main needle (1028,844), boost needle (1028,910).
         // The static main/rim/boost artwork occupies rows above 843 in this atlas region.
         for(int y=843;y<atlasBitmap.Height;y++)for(int x=1027;x<atlasBitmap.Width;x++)atlas[(y*atlasBitmap.Width+x)*4+3]=0;
         srvs[61]=create_rgba_srv(atlas,atlasBitmap.Width,atlasBitmap.Height);
       }
       if(render_pass(ps,cb,cb.Length,srvs,66,0,0,0,0,1,layer)!=0)throw new Exception("Static material layer render failed");
       for(int y=0;y<h;y++)for(int x=0;x<w;x++){int pos=y*w+x,screen=((y+cropY)*W+x+cropX)*4;alpha[pos]=layer[screen+3];}
       var mask=new byte[rgba.Length];var revised=(byte[])rgba.Clone();int changed=0,protectedDark=0,oldDamaged=0,empty=0;
       for(int p=0;p<alpha.Length;p++){
         int k=p*4;int a=rgba[k+3];int material=Math.Min(a,alpha[p]);int bright=Math.Max(rgba[k],Math.Max(rgba[k+1],rgba[k+2]));
         double foreground=Math.Min(1,Math.Max(0,(bright-24)/32.0));double opacity=.15+.85*foreground;
         revised[k+3]=(byte)Math.Round(material+(a-material)*opacity,MidpointRounding.AwayFromZero);
         mask[k]=mask[k+1]=mask[k+2]=alpha[p];mask[k+3]=255;
         if(revised[k+3]!=a)changed++;
         if(revised[k+3]>a)throw new Exception("Alpha increased");
         if(material==0&&bright<=24&&a==255&&revised[k+3]!=38)throw new Exception("Background must remain 15 percent");
         if(a==0){empty++;if(revised[k+3]!=0)throw new Exception("Exterior alpha changed");}
         if(material==255&&bright<=24){protectedDark++;if(revised[k+3]!=(byte)a)throw new Exception("Opaque artwork alpha changed");}
         if(revised[k+3]>Math.Round(a*opacity))oldDamaged++;
         for(int c=0;c<3;c++)if(revised[k+c]!=rgba[k+c])throw new Exception("RGB changed");
       }
       Save(output+"/face-"+face+"-material-mask.png",mask,w,h);Save(output+"/nfsu2_face_"+face+".png",revised,w,h);
       var cropped=new byte[rgba.Length];for(int y=0;y<h;y++)Buffer.BlockCopy(full,((y+cropY)*W+cropX)*4,cropped,y*w*4,w*4);Save(output+"/face-"+face+"-original-d3d.png",cropped,w,h);
       records.Add("{\"face\":"+face+",\"width\":"+w+",\"height\":"+h+",\"cropX\":"+cropX+",\"cropY\":"+cropY+",\"changedBackgroundPixels\":"+changed+",\"opaqueDarkArtworkPixels\":"+protectedDark+",\"recoveredVsBrightnessOnlyPixels\":"+oldDamaged+",\"transparentExteriorPixels\":"+empty+",\"ddsVsDecodedAtlasAlphaMaxDelta\":0,\"rgbUnchanged\":true}");
     }
   }
   return records.ToArray();
 }
}
'@
# Resolve the existing research DLL without copying or installing it.
$env:PATH = (Join-Path $ResearchRoot 'docs') + ';' + $env:PATH
$records = [NfsMaterialAudit]::Run($ResearchRoot,$SourceAssets,$Output) | ForEach-Object { $_ | ConvertFrom-Json }
$inputs = @('docs/d3d11_shader_host.dll','extracted_resources/shaders/res_101.dxbc','extracted_resources/shaders/res_125.dxbc','extracted_resources/shaders_asm/res_125.asm')
foreach ($face in 0..10) { $inputs += "extracted_resources/dds/res_$(660+$face).dds"; $inputs += "extracted_resources/previews/res_$(660+$face).png" }
$provenance = @($inputs | ForEach-Object { $file=Join-Path $ResearchRoot $_; @{file=$_;sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()} })
$sourceFiles = @(0..10 | ForEach-Object { $file="nfsu2_face_$_.png"; @{file=$file;sha256=(Get-FileHash -LiteralPath (Join-Path $SourceAssets $file) -Algorithm SHA256).Hash.ToLowerInvariant()} })
$audit = @{schema='nfsu2-material-preparation/v1';backgroundAlpha=0.15;sourceFiles=$sourceFiles;researchInputs=$provenance;faces=@($records)}
[System.IO.File]::WriteAllText((Join-Path $Output 'material-audit.json'),($audit | ConvertTo-Json -Depth 8),(New-Object System.Text.UTF8Encoding($false)))
$records | Format-Table face,changedBackgroundPixels,opaqueDarkArtworkPixels,recoveredVsBrightnessOnlyPixels
