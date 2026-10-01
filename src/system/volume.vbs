Set WshShell = CreateObject("WScript.Shell")
If WScript.Arguments.Count > 0 Then
    action = LCase(WScript.Arguments(0))
    count = 5
    If WScript.Arguments.Count > 1 Then
        count = CInt(WScript.Arguments(1))
    End If

    If action = "up" Then
        For i = 1 To count
            WshShell.SendKeys(chr(175))
        Next
        WScript.Echo "VOLUME_UP"
    ElseIf action = "down" Then
        For i = 1 To count
            WshShell.SendKeys(chr(174))
        Next
        WScript.Echo "VOLUME_DOWN"
    ElseIf action = "mute" Then
        WshShell.SendKeys(chr(173))
        WScript.Echo "VOLUME_MUTE"
    End If
End If
