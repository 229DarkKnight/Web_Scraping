import easyocr
reader = easyocr.Reader(['en'])
results = reader.readtext('captcha.png')

# Clean and print best guess
if results:
    print(results[0][1].strip())
else:
    print("")
