const originEl=document.getElementById('origin'),secureEl=document.getElementById('secure'),supportEl=document.getElementById('support');
const statusEl=document.getElementById('status'),scanBtn=document.getElementById('scanBtn'),scansEl=document.getElementById('scans');

originEl.textContent=location.origin;
const secure=window.isSecureContext;
secureEl.textContent=secure?'Ja':'Nein';secureEl.className=secure?'ok':'bad';
const supported='NDEFReader' in window;
supportEl.textContent=supported?'Ja':'Nein';supportEl.className=supported?'ok':'bad';

function setStatus(text,tone){statusEl.textContent=text;statusEl.className=tone||''}

if(!secure){
  setStatus('Web NFC verlangt einen sicheren Kontext (HTTPS oder localhost). Diese Seite läuft über '+location.protocol+'//'+location.host+' – der Browser wird das Scannen deshalb vermutlich mit einem Sicherheitsfehler ablehnen, sobald du "Scan starten" antippst. Das ist der gleiche Grund, aus dem crypto.randomUUID() hier nicht funktioniert.','bad');
}else if(!supported){
  setStatus('Dieser Browser kennt die Web-NFC-API (NDEFReader) nicht. Web NFC gibt es praktisch nur in Chrome für Android – nicht in Safari, nicht auf dem iPhone, nicht in Desktop-Browsern.','bad');
}

let reader=null,scanning=false,count=0;

function hex(buf){return[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase()}
function textFrom(record){
  try{
    if(record.recordType==='text'){
      const decoder=new TextDecoder(record.encoding||'utf-8');
      return decoder.decode(record.data.buffer?record.data:new Uint8Array(record.data));
    }
    return hex(record.data.buffer?record.data.buffer:record.data);
  }catch(e){return '(nicht lesbar: '+e.message+')'}
}

function addScan(event){
  count++;
  const serial=(event.serialNumber||'').toUpperCase();
  const card=document.createElement('div');card.className='scan';
  const records=(event.message&&event.message.records)||[];
  card.innerHTML=
    '<div class="uid">'+(serial||'(keine serialNumber geliefert)')+'</div>'+
    '<small>Scan #'+count+' · '+new Date().toLocaleTimeString('de-DE')+' · '+records.length+' NDEF-Datensatz/-sätze</small>'+
    (records.length?records.map(r=>'<pre>'+r.recordType+' / '+(r.mediaType||'-')+'\n'+textFrom(r)+'</pre>').join(''):'<pre>Kein NDEF-Inhalt – bei leeren/werkseitigen NTAG213-Armbändern normal. Die serialNumber oben ist die relevante UID.</pre>');
  scansEl.prepend(card);
}

scanBtn.addEventListener('click',async()=>{
  if(scanning){
    scanning=false;reader=null;scanBtn.textContent='Scan starten';scanBtn.classList.remove('stop');
    setStatus('Gestoppt.');
    return;
  }
  try{
    reader=new NDEFReader();
    await reader.scan();
    scanning=true;scanBtn.textContent='Scan stoppen';scanBtn.classList.add('stop');
    setStatus('Scanne … Armband an das Gerät halten.','ok');
    reader.onreading=addScan;
    reader.onreadingerror=()=>setStatus('Lesefehler – Armband nochmal genau auf den NFC-Bereich des Geräts halten.','bad');
  }catch(e){
    setStatus('Scan konnte nicht gestartet werden: '+e.name+' – '+e.message+(secure?'':'\n\n(Erwartet: diese Seite läuft nicht über HTTPS.)'),'bad');
  }
});
