-- MD+SQL Viewer launcher
-- Double-clicking a .md or .sql file (when this app is the default opener) sends
-- an open-document Apple Event -> `on open`. Double-clicking the app -> `on run`.
-- Both route to the bundled seed-and-open.sh + viewer.html in Contents/Resources.

on run
	openWith({})
end run

on open theFiles
	openWith(theFiles)
end open

on openWith(theFiles)
	set resDir to POSIX path of (path to me) & "Contents/Resources/"
	set helper to quoted form of (resDir & "seed-and-open.sh")
	set template to quoted form of (resDir & "viewer.html")
	set fileArgs to ""
	repeat with f in theFiles
		set fileArgs to fileArgs & " " & quoted form of (POSIX path of f)
	end repeat
	do shell script "/bin/bash " & helper & " " & template & fileArgs
end openWith
