import sys
import easyocr

reader = easyocr.Reader(['en'], verbose=False)
result = reader.readtext(sys.argv[1])

if result:
    print(result[0][1].strip().replace(' ', ''))
else:
    print("")
