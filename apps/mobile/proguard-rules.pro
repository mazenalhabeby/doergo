# =============================================================================
# R8 keep rules — HBCField Android release builds
# -----------------------------------------------------------------------------
# Appended to android/app/proguard-rules.pro by expo-build-properties
# (`android.extraProguardRules`, read from this file in app.config.ts). The
# native project is not checked in, so this file IS the source of truth; edit
# nothing under android/.
#
# WHY THIS FILE EXISTS
# Google Play flags the bundle as under-optimised ("Die App-Optimierung liegt
# unter unserem Grenzwert", 1% obfuscated, deadline Feb 2027) because R8 has
# never run on a release build. Turning R8 on without keep rules is how a
# release crashes in the field: React Native and Expo both resolve classes and
# methods BY NAME at runtime — from the manifest, from JNI, from persisted
# TaskManager state, from Kotlin reflection over module definitions — and R8
# has no way to see those references. A renamed class is a
# ClassNotFoundException on a member's phone at a customer site.
#
# THE BIAS OF THIS FILE IS DELIBERATE: keep too much rather than too little.
# A lower obfuscation percentage is a Play Console warning. A stripped class is
# an outage. Play only asks for 25%; the Kotlin stdlib, AndroidX, Play Services,
# Firebase and ML Kit are all left renameable and together dwarf everything kept
# here, so the threshold is met with room to spare.
#
# ⚠️ NATIVE. None of this reaches a phone through an over-the-air update — it
# takes effect only in a BUILD, and its effect can only be confirmed by
# installing that build.
# =============================================================================


# -----------------------------------------------------------------------------
# Crash reports must stay readable
# -----------------------------------------------------------------------------
# Without these a stack trace from a field device is a list of a/b/c.d(). The
# line table survives obfuscation; the mapping file EAS keeps is what turns it
# back into names.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Annotations, generics and enclosing-class info are read reflectively by
# React Native's module system, Kotlin reflection and Gson-style serializers.
# Dropping them does not crash loudly — it makes a module quietly fail to
# register, which is far harder to trace.
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,Exceptions,RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations,AnnotationDefault


# -----------------------------------------------------------------------------
# JNI — anything native code looks up by name
# -----------------------------------------------------------------------------
# A native method's Java signature is resolved from C++ by string. Renaming
# either side breaks the link with no compile-time signal.
-keepclasseswithmembernames,includedescriptorclasses class * {
    native <methods>;
}

# Facebook's marker for "C++ reaches into this". Present all over React Native,
# Hermes, Fresco and the Expo modules core.
-keep @com.facebook.proguard.annotations.DoNotStrip class * { *; }
-keep @com.facebook.proguard.annotations.DoNotStripAny class * { *; }
-keep @com.facebook.jni.annotations.DoNotStrip class * { *; }
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
    @com.facebook.proguard.annotations.KeepGettersAndSetters *;
    @com.facebook.jni.annotations.DoNotStrip *;
}


# -----------------------------------------------------------------------------
# React Native core + Hermes
# -----------------------------------------------------------------------------
# The bridge finds a module by its @ReactModule name and a method by its
# @ReactMethod name, both strings coming from JavaScript. TurboModules and
# Fabric components add a second name-based lookup through the codegen specs.
-keep,includedescriptorclasses class com.facebook.react.** { *; }
-keep,includedescriptorclasses class com.facebook.hermes.** { *; }
-keep,includedescriptorclasses class com.facebook.jni.** { *; }
-keep,includedescriptorclasses class com.facebook.soloader.** { *; }
-keep,includedescriptorclasses class com.facebook.yoga.** { *; }
-keep class * extends com.facebook.react.bridge.BaseJavaModule { *; }
-keep class * extends com.facebook.react.bridge.NativeModule { *; }
-keep class * extends com.facebook.react.uimanager.ViewManager { *; }
-keep class * implements com.facebook.react.bridge.ReactPackage { *; }
-keep class * implements com.facebook.react.bridge.JavaScriptModule { *; }
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod <methods>;
    @com.facebook.react.uimanager.annotations.ReactProp <methods>;
    @com.facebook.react.uimanager.annotations.ReactPropGroup <methods>;
}
# This app's own generated package list and any code under its package.
-keep class com.hbcfield.app.** { *; }
-dontwarn com.facebook.**


# -----------------------------------------------------------------------------
# Expo modules core
# -----------------------------------------------------------------------------
# expo-modules-core builds every module's surface with Kotlin reflection over
# the DSL in its definition block: function names, property names and the
# CLASSES OF THEIR ARGUMENTS are all read at runtime. This is the single
# highest-risk area in the whole app — renaming here produces modules that
# register and then answer nothing.
-keep,includedescriptorclasses class expo.modules.** { *; }
-keep,includedescriptorclasses class expo.interfaces.** { *; }
-keep class * extends expo.modules.core.interfaces.Package { *; }
-keep class * extends expo.modules.kotlin.modules.Module { *; }
-keep class * implements expo.modules.core.interfaces.ApplicationLifecycleListener { *; }
-keep class * implements expo.modules.core.interfaces.ReactActivityLifecycleListener { *; }
-dontwarn expo.modules.**

# Kotlin's own reflection metadata. expo-modules-core cannot read a class's
# definition without it.
-keep class kotlin.Metadata { *; }
-keep class kotlin.reflect.** { *; }
-keep class kotlin.jvm.internal.** { *; }
-keepclassmembers class **$WhenMappings { <fields>; }
-dontwarn kotlin.**
-dontwarn kotlinx.coroutines.**


# -----------------------------------------------------------------------------
# expo-location + expo-task-manager — the background route tracker
# -----------------------------------------------------------------------------
# ⚠️ The headless task is the worst failure mode in this app. TaskManager
# persists the task's CONSUMER CLASS NAME to disk and instantiates it by that
# string when the OS restarts the process — sometimes days later, with the app
# closed. R8 sees no reference to it anywhere, so without this rule the class is
# renamed or removed, and background GPS silently stops recording the route to
# a job. Nothing crashes visibly; the route is simply a straight line again.
-keep,includedescriptorclasses class expo.modules.location.** { *; }
-keep,includedescriptorclasses class expo.modules.taskManager.** { *; }
-keep,includedescriptorclasses class expo.modules.interfaces.taskManager.** { *; }
-keep class * implements expo.modules.interfaces.taskManager.TaskConsumerInterface { *; }
-keep class * implements expo.modules.interfaces.taskManager.TaskInterface { *; }

# expo-background-task runs through WorkManager, which also instantiates a
# Worker from a class name it stored in its own database.
-keep class androidx.work.** { *; }
-keep class * extends androidx.work.Worker { *; }
-keep class * extends androidx.work.ListenableWorker { *; }
-keep class * extends androidx.work.InputMerger { *; }
-dontwarn androidx.work.**


# -----------------------------------------------------------------------------
# expo-notifications + Firebase
# -----------------------------------------------------------------------------
# The messaging service and the boot receiver are named in the merged manifest,
# so Android instantiates them by string. Notification payloads are also
# serialised to and from disk when a notification outlives the process.
-keep,includedescriptorclasses class expo.modules.notifications.** { *; }
-keep class * extends com.google.firebase.messaging.FirebaseMessagingService { *; }
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.tasks.** { *; }
-dontwarn com.google.firebase.**


# -----------------------------------------------------------------------------
# expo-secure-store + expo-sqlite (SQLCipher)
# -----------------------------------------------------------------------------
# The offline database is SQLCipher. Its bindings are JNI and its provider is
# loaded by name; losing either leaves the app unable to open the member's
# local copy of their work — which on this app means a device that cannot show
# anything offline.
-keep,includedescriptorclasses class expo.modules.securestore.** { *; }
-keep,includedescriptorclasses class expo.modules.sqlite.** { *; }
-keep class net.zetetic.** { *; }
-keep class net.sqlcipher.** { *; }
-dontwarn net.zetetic.**
-dontwarn net.sqlcipher.**


# -----------------------------------------------------------------------------
# expo-updates
# -----------------------------------------------------------------------------
# Reads the embedded manifest and its own database through reflection. A broken
# expo-updates is an app that can never receive an OTA fix for whatever else
# broke — so this one keeps itself able to repair the rest.
-keep,includedescriptorclasses class expo.modules.updates.** { *; }


# -----------------------------------------------------------------------------
# ML Kit — the on-device text reader (cards, receipts, contracts, documents)
# -----------------------------------------------------------------------------
# ⚠️ ML Kit loads its script-specific recognisers reflectively and ships parts
# of itself as optional modules resolved by class name. It is also obfuscation-
# hostile in a specific way: the failure is not a crash but an empty read, so a
# member photographs a receipt and the app says it could not find a total.
-keep,includedescriptorclasses class expo.modules.mlkitocr.** { *; }
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit_** { *; }
-keep class com.google.android.odml.** { *; }
-dontwarn com.google.mlkit.**
-dontwarn com.google.android.odml.**


# -----------------------------------------------------------------------------
# Maps, camera, images
# -----------------------------------------------------------------------------
-keep,includedescriptorclasses class com.rnmaps.maps.** { *; }
-keep class com.google.android.gms.maps.** { *; }
-keep interface com.google.android.gms.maps.** { *; }
-keep class com.google.android.gms.common.** { *; }
-dontwarn com.google.android.gms.**

-keep,includedescriptorclasses class expo.modules.camera.** { *; }
-keep class androidx.camera.** { *; }
-dontwarn androidx.camera.**

# expo-image is Glide-backed; Glide's generated API and its module registry are
# annotation-processor output referenced only by name.
-keep class com.bumptech.glide.** { *; }
-keep class * extends com.bumptech.glide.module.AppGlideModule { *; }
-keep class * extends com.bumptech.glide.module.LibraryGlideModule { *; }
-keep public enum com.bumptech.glide.load.**  { **[] $VALUES; public *; }
-dontwarn com.bumptech.glide.**


# -----------------------------------------------------------------------------
# Animation, gestures, navigation, drawing
# -----------------------------------------------------------------------------
# Reanimated and Worklets run JavaScript on a second runtime through JNI and
# resolve host objects by name across that boundary.
-keep,includedescriptorclasses class com.swmansion.reanimated.** { *; }
-keep,includedescriptorclasses class com.swmansion.worklets.** { *; }
-keep,includedescriptorclasses class com.swmansion.gesturehandler.** { *; }
-keep,includedescriptorclasses class com.swmansion.rnscreens.** { *; }
-keep,includedescriptorclasses class com.horcrux.svg.** { *; }


# -----------------------------------------------------------------------------
# Biometric sign-in
# -----------------------------------------------------------------------------
# Losing this does not crash — resolveCapability reports 'unavailable' and every
# biometric surface hides itself, which is exactly the invisible failure the
# with-biometric-permissions plugin exists to prevent. Same failure, different
# cause; same treatment.
-keep,includedescriptorclasses class com.sbaiahmed1.reactnativebiometrics.** { *; }
-keep class androidx.biometric.** { *; }
-dontwarn androidx.biometric.**


# -----------------------------------------------------------------------------
# WebView bridges
# -----------------------------------------------------------------------------
# Any method a page calls through addJavascriptInterface is reached by name
# from JavaScript. R8 cannot see the call site at all.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}


# -----------------------------------------------------------------------------
# Networking
# -----------------------------------------------------------------------------
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-keep class okio.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**


# -----------------------------------------------------------------------------
# Platform contracts R8 cannot infer
# -----------------------------------------------------------------------------
# Parcelable's CREATOR is only ever read reflectively by the framework.
-keepclassmembers class * implements android.os.Parcelable {
    public static final ** CREATOR;
}

# Serializable's private hooks, likewise.
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# Enum.valueOf(String) is a name lookup; every enum crossing the RN bridge or
# coming out of stored JSON depends on it.
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Views inflated from XML are constructed by class name by the layout inflater,
# and their setters are found by the "set" + attribute-name convention.
-keepclassmembers class * extends android.view.View {
    void set*(***);
    *** get*();
}

# AndroidX / Play Services annotations these libraries compile against but do
# not ship. Without the -dontwarn, R8 refuses the build outright.
-dontwarn javax.annotation.**
-dontwarn javax.lang.model.**
-dontwarn com.google.errorprone.annotations.**
-dontwarn org.jetbrains.annotations.**
