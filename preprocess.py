import cv2
import sys

img = cv2.imread(sys.argv[1], cv2.IMREAD_GRAYSCALE)
_, thresh = cv2.threshold(img, 130, 255, cv2.THRESH_BINARY_INV)
cv2.imwrite("captcha_cleaned.png", thresh)
