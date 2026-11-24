plugins { id("com.android.application");id("org.jetbrains.kotlin.android") }
android { namespace="de.boersenparty.terminal";compileSdk=35
 // HTTPS: plain HTTP on this host now only serves the display and an onboarding page (see
 // deploy/locations-http.conf) — everything else, including this terminal, requires HTTPS.
 defaultConfig { applicationId="de.boersenparty.terminal";minSdk=26;targetSdk=35;versionCode=1;versionName="0.1.0";buildConfigField("String","TERMINAL_URL","\"https://192.168.2.190/\"") }
 buildFeatures { buildConfig=true };buildTypes { release { isMinifyEnabled=true;proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"),"proguard-rules.pro") } }
}
dependencies { implementation("androidx.appcompat:appcompat:1.7.0");implementation("androidx.webkit:webkit:1.12.1") }
