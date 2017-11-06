# 输入法深入理解
介绍输入法之前先介绍一下输入法框架相关的名词缩写：
 - IMF（Input MethodFramework）：输入法框架
 - IM（Input Method）：输入法
 - IMS（Input Method Service）：输入法服务，一般指一个具体输入法对应的服务
 - IMMS（Input Method ManagerService）：输入法管理器服务，系统进程的一部分，系统中只有一个该服务的实例
 - IMM（Input Method Manager）：输入法管理器，每个客户进程中都包含一个
 - IME（Input Method Engine/InputMethod Editor）：指一个具体的输入法，包括其内部的IMS和Binder对象
 - CA（Client Application）：客户端进程，这里指使用输入法的进程。
## 输入法框架
![输入法框架图](http://ronny.oss-cn-shanghai.aliyuncs.com/frame.png)
**Binder1: InputConnection**
这个binder是编辑框做Server端，输入法进程做Client端，主要作用是负责InputMethod进程和应用进程的编辑框的通信，如上屏、查询光标前后字符等。下面一张图显示的是InputConnection模块的类图。IInputContext.aidl表征IMS进程和ClientApp进程的通信协议，两边的实现类分别是IInputConnectionWrapper(Server)和InputConnectionWrapper(Client)；另一方面，两者都会在内部持有一个InputConnection对象，因此我们也使用InputConnection这个接口来表征两者的通信。

**BINDER2: InputMethodClient**
IMMS查找和IMS对应的客户端应用进程，并负责通知应用进程绑定/解绑输入法。
```java
oneway interface IInputMethodClient {
    void setUsingInputMethod(boolean state);
    void onBindMethod(in InputBindResult res);
    // unbindReason corresponds to InputMethodClient.UnbindReason.
    void onUnbindMethod(int sequence, int unbindReason);
    void setActive(boolean active, boolean fullscreen);
    void setUserActionNotificationSequenceNumber(int sequenceNumber);
    void reportFullscreenMode(boolean fullscreen);
}
```
类图如下：
![inputmethodclient类图](http://ronny.oss-cn-shanghai.aliyuncs.com/inputmethodclient.png)
根据图中的示意，这个binder其实相当于一个媒介binder。其中，服务端对象mClient会跟随IMM的创建而创建。而客户端的对象其实在IMMS的一个map中。其实当系统认为一个客户进程（应用程序）如果有可能会需要使用输入法，就会把它注册到IMMS中，以便后续谁需要输入法服务的时候，IMMS可以找到对应的客户进程，那么什么时候它可能会使用输入法呢？当然是它展现窗口的时候了。所以从这个角度来说，就好理解为什么注册时机会是这个应用程序向WMS申请窗口的时候了。
**Binder3:InputMethodSession**
这个binder其实定义了客户端可以调用输入法的相关方法。先大概看看接口方法：
```java
interface IInputMethodSession {
  void finishInput();
  void updateExtractedText(int token, in ExtractedText text);
  void updateSelection(int oldSelStart, int oldSelEnd, int newSelStart, int newSelEnd, int candidatesStart, int candidatesEnd);
  void viewClicked(boolean focusChanged);
  void updateCursor(in Rect newCursor);
  void displayCompletions(in CompletionInfo[] completions);
  void appPrivateCommand(String action, in Bundle data);
  void toggleSoftInput(int showFlags, int hideFlags);
  void finishSession();
  void updateCursorAnchorInfo(in CursorAnchorInfo cursorAnchorInfo);
}
```
这个binder其实对应于一个客户端应用进程，所以当有一个客户端应用程序接入的时候创建，创建以后又要把客户端binder传过去。不过这个交互的过程需要IMMS作为媒介，而和IMMS交互的过程中又牵涉到InputMethod这个接口。
大概的意思是，IMMS先调用bindService启动IMS，然后IMS会返回一个Binder给IMMS。然后有了这个binder，IMMS就会在需要的时候，调用IMS的createSession创建这个SessionBinder,然后传给客户端进程。

**Binder4: IInputMethod**
IInputMethod这个binder是IMS和IMMS交互用的。先看一下接口方法：
```java
interface IInputMethod {
  void attachToken(IBinder token);
  void bindInput(in InputBinding binding);
  void unbindInput();
  void startInput(in IInputContext inputContext, in EditorInfo attribute);
  void restartInput(in IInputContext inputContext, in EditorInfo attribute);
  void createSession(in InputChannel channel, IInputSessionCallback callback);
  void setSessionEnabled(IInputMethodSession session, boolean enabled);
  void revokeSession(IInputMethodSession session);
  void showSoftInput(int flags, in ResultReceiver resultReceiver);
  void hideSoftInput(int flags, in ResultReceiver resultReceiver);
  void changeInputMethodSubtype(in InputMethodSubtype subtype);
}
```
这个binder其实是随着输入法启动，就一直不会变化的（也就是和IMS是拥有同一个生命周期的），所以创建一次就不用再创建了。创建时机自然是IMMS启动IMS的时候（bindService)。
### 框架图分析2
1、客户端进程（CA）：在每个CA中都存在唯一一个IMM，UI控件（View,TextView,EditText等）可以通过它来访问IMMS，用来操作输入法，比如，打开，关闭，切换输入法等。可以通过Context.getSystemService()来获取一个InputMethodManager的实例。
IMM中有2个Binder对象，一个是可编辑UI控件对应的Binder对象（InputContext），输入法进程可以通过InputContext将虚拟按键事件（即通过触屏消息转换而来的按键事件）传递给UI控件；另一个是InputMethodClient，IMMS将通过它访问CA，例如IMMS通过它将IMS的InputMethodSession传递给CA，从而使得CA可以直接访问IMS。
2、输入法进程：和客户端进程类似，它也有2个Binder对象，一个是IMS对应的Binder对象，IMMS将通过它去控制输入法，例如：显示或者隐藏输入法窗口；另一个是专门供客户端使用的Binder对象，客户端主要通过它来向输入法进程传送按键事件。
具体可参见下图：
![输入法框架图](http://ronny.oss-cn-shanghai.aliyuncs.com/frame1.png)
处理的消息有两种：
    按键消息，由客户端进程接收，如果客户端进程判断当前有输入法窗口，则需要跨进程转交给InputMethod进程
    触屏消息（触摸在输入法窗口中），由输入法处理，结束后把结果跨进程提交给客户端进程
### 输入法主要操作过程
![总体过程](
http://ronny.oss-cn-shanghai.aliyuncs.com/IMFRUNPROCESS2.png)
### 显示输入法
一般来讲，editText被点击自动获取焦点之后，会调用IMM的showSoftInput，然后转向IMMS的showSoftInput。再然后需要让IMS去显示输入法，这个过程大概是下面这个样子的：
![IMS和IMMS模块的通信过程](http://ronny.oss-cn-shanghai.aliyuncs.com/IMS%E5%92%8CIMMS%E6%A8%A1%E5%9D%97%E7%9A%84%E9%80%9A%E4%BF%A1%E8%BF%87%E7%A8%8B%20%283%29.png)
IMS和IMMS模块的通信过程

输入法窗口内部显示过程
IMS.showWindow的过程：
```java
// InputMethodService.InputMethodImpl 
public void showSoftInput(int flags, ResultReceiver resultReceiver) {
    boolean wasVis = isInputViewShown();
    mShowInputFlags = 0;
    if (onShowInputRequested(flags, false)) { // 这个方法内部会调用onEvaluateInputViewShown
        try {
            showWindow(true); // 重点在这里
        } catch (BadTokenException e) {
            mWindowVisible = false;
            mWindowAdded = false;
        }
    }
    clearInsetOfPreviousIme();
    // If user uses hard keyboard, IME button should always be shown.
    boolean showing = isInputViewShown();
    mImm.setImeWindowStatus(mToken, IME_ACTIVE | (showing ? IME_VISIBLE : 0),
            mBackDisposition);
    if (resultReceiver != null) { // 将此次showWindow的结果状态返回回去：Result_shown/.../...
        resultReceiver.send(wasVis != isInputViewShown()
                ? InputMethodManager.RESULT_SHOWN
                : (wasVis ? InputMethodManager.RESULT_UNCHANGED_SHOWN
                        : InputMethodManager.RESULT_UNCHANGED_HIDDEN), null);
    }
}

// InputMethodService
public void showWindow(boolean showInput) {
    if (mInShowWindow) {   // 正在显示窗口，直接返回
        return;
    }

    try {
        mWindowWasVisible = mWindowVisible;
        mInShowWindow = true;
        showWindowInner(showInput); // 显示窗口
    } finally {
        mWindowWasVisible = true;
        mInShowWindow = false;
    }
}

void showWindowInner(boolean showInput) {
    boolean doShowInput = false;
    final int previousImeWindowStatus =
            (mWindowVisible ? IME_ACTIVE : 0) | (isInputViewShown() ? IME_VISIBLE : 0);
    mWindowVisible = true;
    if (!mShowInputRequested) {
        if (mInputStarted) {
            if (showInput) {
                doShowInput = true;
                mShowInputRequested = true;
            }
        }
    } else {
        showInput = true;
    }

    initialize(); // 这里面有个标志判断是否要进行onInitializeInterface回调
    updateFullscreenMode();
    updateInputViewShown();

    if (!mWindowAdded || !mWindowCreated) {
        mWindowAdded = true;
        mWindowCreated = true;
        initialize();
        View v = onCreateCandidatesView();
        if (v != null) {
            setCandidatesView(v);
        }
    }
    if (mShowInputRequested) {
        if (!mInputViewStarted) {
            mInputViewStarted = true;
            onStartInputView(mInputEditorInfo, false); // 回调onStartInputView
        }
    } else if (!mCandidatesViewStarted) {
        mCandidatesViewStarted = true;
        onStartCandidatesView(mInputEditorInfo, false);
    }

    if (doShowInput) {
        startExtractingText(false);
    }

    final int nextImeWindowStatus = IME_ACTIVE | (isInputViewShown() ? IME_VISIBLE : 0);
    if (previousImeWindowStatus != nextImeWindowStatus) {
        mImm.setImeWindowStatus(mToken, nextImeWindowStatus, mBackDisposition);
    }
    if ((previousImeWindowStatus & IME_ACTIVE) == 0) {
        onWindowShown();
        mWindow.show();
        mShouldClearInsetOfPreviousIme = false;
    }
}
```
## CA调IMM
.调用显示系统默认的输入法:
InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
imm.showSoftInput(m_receiverView(接受软键盘输入的视图(View)),InputMethodManager.SHOW_FORCED(提供当前操作的标记，SHOW_FORCED表示强制显示));

.调用隐藏系统默认的输入法
((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(this.getCurrentFocus().getWindowToken(), InputMethodManager.HIDE_NOT_ALWAYS);

## 输入法应用IME
### 从实现一个android输入法的角度来分析android输入法。

扩展的输入法框架，允许应用为用户提供不同的输入法，比如触屏键盘甚至语音输入。只要安装，用户就可以从系统设置中选择自己喜欢使用的输入法，并且在整个系统环境中使用；在同一时刻，只有一种输入法可以使用。

创建输入法首先需要继承InputMethodService类，这个是输入法的Main class.
通常还要创建一个”settings”的activity，用来向IME服务传递参数选项。你也可以自定义设置界面，把它作为系统设置的一部分。
- 输入法的生命周期
- 在application manifest中声明IME组件
- 输入法 API
- 设计输入法的用户界面
- 从输入法向应用程序发送文本
- 创建不同类型的输入法

文档中可以找到所有输入类型的完整描述。使用正确的输入类型是很重要的，这样软键盘就可以为用户输入的文本使用最优的键盘布局。
inputType也是可以任意组合。
> Xml代码:
```xml
<EditText android:id="@+id/edtInput" android:layout_width="0dip"   
  android:layout_height="wrap_content"  
  android:layout_weight="1"  
 android:inputType="textShortMessage|textAutoCorrect|textCapSentences|textMultiLine"  
  android:imeOptions="actionSend|flagNoEnterAction"  
  android:maxLines="4"  
  android:maxLength="2000"  
  android:hint="@string/compose_hint"  
/> 
 ```
可以在AndroidManifest.xml指定当activity显示时是否自动显示IME
> Xml代码:
```xml
<activity name="EditContactActivity" android:windowSoftInputMode="stateVisible|adjustResize">  
...  
</activity> 
```
输入法的定制最终也是对action button的定义
例如：
>- 重载enter键
>- 全屏键

一个预定义的动作常量(actionGo、actionSearch、actionSend、actionNext、actionDone)。如果这些都没有指定，系统将根据是否有一个可聚焦的字段来推断下一步操作或操作;您可以显式地强制使用actionNone操作。
```xml
<EditText android:imeOptions="actionSend|flagNoEnterAction" />
 
```
> 大多数情况下输入法和应用程序之间的交互是通过android.view.inputmethod.InputConnection 这个类实现的。
这个类是一个应用的实现。一个IME调用来对应用程序执行适当的编辑操作。您通常不需要为此担心，因为TextView提供了它自己的实现
#### 输入法的生命周期
![android输入法的生命周期](http://ronny.oss-cn-shanghai.aliyuncs.com/inputmethod_lifecycle_image2.png)
android输入法的生命周期
#### 在application manifest中声明IME组件

> 下面的代码声明了一个输入法的service.它请求了BIND_INPUT_METHOD 权限，来允许服务把IME和系统关联起来，创建一个intent filter来匹配android.view.InputMethod,并且定义了输入法的元数据。
```xml
<service android:name=".LtPinyinIME"
    android:label="@string/ime_name"
        android:permission="android.permission.BIND_INPUT_METHOD">
    <intent-filter>
        <action android:name="android.view.InputMethod" />
    </intent-filter>
    <meta-data android:name="android.view.im" android:resource="@xml/method" />
</service>
```
> 下一个代码片段声明了输入法的设置activity.它包含了一个ACTION_MAIN的intent filter，表示此activity作为整个输入法应用的入口。
```xml
<activity android:name=".SettingsActivity"
    android:label="@string/ime_settings_activity_name">
    <intent-filter>
        <action android:name="android.intent.action.MAIN"/>
    </intent-filter>
</activity>
```
#### 输入法的API
> 在android.inputmethodservice和android.view.inputmethod包中可以找到输入法相关的class。其中KeyEvent 是处理字符按键的重要类。
> 输入法的中心环节就是一个service组件，该组件扩展了InputMethodService。除了实现普通的service生命周期以外，该类需要给UI层提供回调函数，用来处理用户输入，并且把文本传递给输入焦点。InputMethodService类实现了大部分管理输入法状态、界面以及和当前输入框通信的逻辑。
以下class同样重要：
**BaseInputConnection**
定义了从输入法到接收输入的应用程序之间的通信通道。使用该类可以获取光标附近的文本，可以把字符串提交给文本框，还可以向应用程序发送原生的按键消息。应用程序应该扩展该类，而不要实现InputConnection。
**KeyboardView**
该类扩展了View使其能够展现出一个键盘并且相应用户的输入事件。可以通过一个XML文件来定义键盘布局。
#### 设计输入法的用户界面
> -输入法有两个主要的可见的界面元素：输入窗和候选窗。你只需要实现和输入法相关的界面元素即可。
Input view
输入窗是指用户通过按键或手写或手势直接产生的文本展示区域。当输入法首次展现时，系统调用onCreateInputView()回调函数。你需要在该方法中创建输入法界面布局，并将该布局返回给系统。下面的代码片段实现了onCreateInputView()方法：
```java
 @Override
    public View onCreateInputView() {
        MyKeyboardView inputView =
            (MyKeyboardView) getLayoutInflater().inflate( R.layout.input, null);

        inputView.setOnKeyboardActionListener(this);
        inputView.setKeyboard(mLatinKeyboard);

        return mInputView;
    }

```
在该实例中，MyKeyboardView实现了类[KeyboardView](https://developer.android.com/reference/android/inputmethodservice/KeyboardView.html)，用来自定义一个键盘。如果你使用传统的QWERTY键盘，请参见KeyboardView类。
构建基础输入法应用：
创建LtPinyinIME类，继承InputMethodService并实现KeyboardView.OnKeyboardActionListener
重写onPress,onCreateInputView,swipeUp,onRelease,onRelease,onKey,onText.
在onCreateInputView创建输入法view，在keyboard被创建后，将调用onCreateInputView函数，在onKey方法中响应按键消息。
> 在onCreateInputView创建Keyboard，设置KeyboardView显示的Keyboar<br>
```java
     @Override
     public View onCreateInputView() {
        mKeyboardView = (KeyboardView)getLayoutInflater().inflate(R.layout.skb_container,null);
        mKeyboard = new Keyboard(this,R.xml.qwerty);
        mKeyboardView.setKeyboard(mKeyboard);
        mKeyboardView.setOnKeyboardActionListener(this);

        return mKeyboardView;
    }
```
> 在onKey方法中响应按键消息，可以添加一些功能按键，指定keycode,来相应按键功能，如在点击按键时播放按键声音，添加关闭软键盘按键等,最终通过InputConnection将输入内用提交给应用显示在编辑框
```java
    @Override
    public void onKey(int primaryCode, int[] keyCodes) {
        Log.e(TAG,"Enter onKey ---- primaryCode:"+primaryCode+"; keyCodes:"+keyCodes+"; length:"+keyCodes.length);
        for (int i=0;i<keyCodes.length;i++){
            Log.e(TAG,"on onKey --i = "+i+"; -- KEYCODE:"+keyCodes[i]);
        }
        InputConnection ic = getCurrentInputConnection();
        Log.e(TAG,"on onKey -1--- KEYCODE_DELETE:"+Keyboard.KEYCODE_DELETE+"; KEYCODE_DONE:"+Keyboard.KEYCODE_DONE+"; code:"+(char)primaryCode);
        switch (primaryCode){
            case Keyboard.KEYCODE_DELETE:
                ic.deleteSurroundingText(1,0);
                break;
            case Keyboard.KEYCODE_CANCEL:
                handleClose();　　
                break;
            default:
                char code = (char)primaryCode;
                Log.e(TAG,"on onKey -2--- primaryCode:"+primaryCode+"; code:"+code);
                ic.commitText(String.valueOf(code),1);
        }
    }

```
