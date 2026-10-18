; drawio-data installer additions (electron-builder "nsis.include").
;
; drawio-data installs next to draw.io: its own folder, app ID and
; settings. The only thing the two could share is the .drawio file type,
; so the installer asks whether drawio-data should open .drawio files:
; - an options page with a check box, unchecked by default when another
;   application (such as draw.io) already opens .drawio files;
; - drawio-data is always added to "Open with" for .drawio files, which
;   does not change the default application;
; - uninstalling removes only what drawio-data added.
; A silent install (/S) uses the default.

!include LogicLib.nsh
!include nsDialogs.nsh
!include MUI2.nsh

!define DF_PROGID "drawio-data.drawio"

!ifndef BUILD_UNINSTALLER

Var DfAssociate
Var DfAssociateBox

; Checked unless .drawio files already open with another application
!macro customInit
	StrCpy $DfAssociate ${BST_CHECKED}
	ReadRegStr $0 HKCU "Software\Classes\.drawio" ""
	ReadRegStr $1 HKLM "Software\Classes\.drawio" ""

	${If} $0 != ""
	${AndIf} $0 != "${DF_PROGID}"
		StrCpy $DfAssociate ${BST_UNCHECKED}
	${ElseIf} $0 == ""
	${AndIf} $1 != ""
	${AndIf} $1 != "${DF_PROGID}"
		StrCpy $DfAssociate ${BST_UNCHECKED}
	${EndIf}
!macroend

!macro customPageAfterChangeDir
	Page custom DfOptionsPage DfOptionsPageLeave
!macroend

Function DfOptionsPage
	!insertmacro MUI_HEADER_TEXT "Diagram files" "Choose which application opens .drawio files."
	nsDialogs::Create 1018
	Pop $0

	${NSD_CreateLabel} 0 0 100% 40u "drawio-data is installed next to draw.io and does not change it.$\r$\n$\r$\nIf you already use draw.io, leave this unchecked so .drawio files keep opening in draw.io. You can still open them in drawio-data with File > Open, or right-click > Open with."
	Pop $0

	${NSD_CreateCheckbox} 0 52u 100% 12u "Open .drawio files with drawio-data"
	Pop $DfAssociateBox

	${If} $DfAssociate == ${BST_CHECKED}
		${NSD_Check} $DfAssociateBox
	${EndIf}

	nsDialogs::Show
FunctionEnd

Function DfOptionsPageLeave
	${NSD_GetState} $DfAssociateBox $DfAssociate
FunctionEnd

!macro customInstall
	; The file type, offered in "Open with" without becoming the default
	WriteRegStr SHELL_CONTEXT "Software\Classes\${DF_PROGID}" "" "draw.io Diagram (drawio-data)"
	WriteRegStr SHELL_CONTEXT "Software\Classes\${DF_PROGID}\DefaultIcon" "" "$appExe,0"
	WriteRegStr SHELL_CONTEXT "Software\Classes\${DF_PROGID}\shell\open\command" "" '"$appExe" "%1"'
	WriteRegStr SHELL_CONTEXT "Software\Classes\.drawio\OpenWithProgids" "${DF_PROGID}" ""

	${If} $DfAssociate == ${BST_CHECKED}
		WriteRegStr SHELL_CONTEXT "Software\Classes\.drawio" "" "${DF_PROGID}"
	${EndIf}

	System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!endif

!macro customUnInstall
	; Gives .drawio back only if drawio-data was its default
	ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.drawio" ""

	${If} $0 == "${DF_PROGID}"
		DeleteRegValue SHELL_CONTEXT "Software\Classes\.drawio" ""
	${EndIf}

	DeleteRegValue SHELL_CONTEXT "Software\Classes\.drawio\OpenWithProgids" "${DF_PROGID}"
	DeleteRegKey SHELL_CONTEXT "Software\Classes\${DF_PROGID}"
	System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
