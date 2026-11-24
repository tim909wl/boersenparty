package de.boersenparty.terminal

import android.app.PendingIntent
import android.content.Intent
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity:AppCompatActivity(){
 private lateinit var web:WebView
 private val nfc by lazy{NfcAdapter.getDefaultAdapter(this)}
 private val pending by lazy{PendingIntent.getActivity(this,0,Intent(this,javaClass).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_MUTABLE)}
 override fun onCreate(state:Bundle?){super.onCreate(state);web=WebView(this);setContentView(web);with(web.settings){javaScriptEnabled=true;domStorageEnabled=true;allowFileAccess=false;allowContentAccess=false;mixedContentMode=android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW};web.webViewClient=object:WebViewClient(){override fun shouldOverrideUrlLoading(v:WebView?,r:android.webkit.WebResourceRequest?)=r?.url?.host!=android.net.Uri.parse(BuildConfig.TERMINAL_URL).host};web.loadUrl(BuildConfig.TERMINAL_URL);handle(intent)}
 override fun onResume(){super.onResume();nfc?.enableReaderMode(this,{tag->runOnUiThread{deliver(tag)}},NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK,null)}
 override fun onPause(){nfc?.disableReaderMode(this);super.onPause()}
 override fun onNewIntent(i:Intent){super.onNewIntent(i);handle(i)}
 private fun handle(i:Intent){i.getParcelableExtra<Tag>(NfcAdapter.EXTRA_TAG)?.let(::deliver)}
 private fun deliver(tag:Tag){val uid=tag.id.joinToString(""){"%02X".format(it)};val safe=org.json.JSONObject.quote(uid);web.evaluateJavascript("window.onNfcUid && window.onNfcUid($safe)",null)}
}
