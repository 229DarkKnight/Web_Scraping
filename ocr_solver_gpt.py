# ocr_solver_gpt_enhanced.py
import sys
import base64
import os
import time
import re
from openai import OpenAI
from dotenv import load_dotenv
from PIL import Image
import json

# Load environment variables
load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")

if not api_key:
    print("❌ OPENAI_API_KEY not set", file=sys.stderr)
    sys.exit(1)

# Initialize OpenAI client
client = OpenAI(api_key=api_key)

# Get image path
if len(sys.argv) < 2:
    print("❌ Usage: python ocr_solver_gpt.py <image_path>", file=sys.stderr)
    sys.exit(1)

image_path = sys.argv[1]

# Analyze image properties
try:
    with Image.open(image_path) as img:
        width, height = img.size
        mode = img.mode
        print(f"📊 Image info: {width}x{height}, mode: {mode}", file=sys.stderr)

        # Convert to RGB if needed
        if mode != 'RGB':
            img = img.convert('RGB')
            temp_path = 'temp_converted.jpg'
            img.save(temp_path, 'JPEG')
            image_path = temp_path
except Exception as e:
    print(f"❌ Error analyzing image: {e}", file=sys.stderr)

# Encode image to base64
try:
    with open(image_path, "rb") as image_file:
        encoded_image = base64.b64encode(image_file.read()).decode("utf-8")
except Exception as e:
    print(f"❌ Error reading image: {e}", file=sys.stderr)
    sys.exit(1)

# Try multiple prompts for better accuracy
prompts = [
    {
        "prompt": (
            "This is a CAPTCHA image containing exactly 5 characters. "
            "The characters are lowercase letters (a-z) and/or digits (0-9). "
            "They appear in white or light color on a darker background. "
            "Respond with ONLY the 5 characters, nothing else. "
            "Example responses: h9x2d, 4t7m3, b6g1q"
        ),
        "temperature": 0
    },
    {
        "prompt": (
            "Look at this security code image very carefully. "
            "It shows 5 characters (letters a-z and numbers 0-9). "
            "Some characters might be distorted or overlapping. "
            "Common confusions: 0/o, 1/l/i, 5/s, 6/b, 8/B. "
            "Return exactly 5 characters, lowercase only."
        ),
        "temperature": 0.1
    },
    {
        "prompt": (
            "This CAPTCHA has 5 characters total. Count them carefully. "
            "If you see any uppercase letters, convert them to lowercase. "
            "Ignore any noise, lines, or dots - focus only on the main characters. "
            "Your response must be exactly 5 characters long."
        ),
        "temperature": 0.2
    }
]

# Store all attempts for comparison
all_attempts = []

for i, prompt_config in enumerate(prompts):
    print(f"🔁 GPT attempt {i+1} with prompt variant {i+1}...", file=sys.stderr)

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert at reading CAPTCHA images. You must respond with exactly 5 characters."
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt_config["prompt"]},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{encoded_image}",
                                "detail": "high"
                            }
                        }
                    ]
                }
            ],
            max_tokens=10,
            temperature=prompt_config["temperature"]
        )

        raw = response.choices[0].message.content.strip()
        print(f"🧪 RAW GPT response: {repr(raw)}", file=sys.stderr)

        # Clean the response
        cleaned = re.sub(r'[^a-z0-9]', '', raw.lower())

        if len(cleaned) == 5:
            all_attempts.append(cleaned)
            print(f"✓ Valid response: {cleaned}", file=sys.stderr)
        else:
            print(
                f"⚠️ Invalid length ({len(cleaned)}): {cleaned}", file=sys.stderr)

    except Exception as e:
        print(f"❌ Error calling GPT: {e}", file=sys.stderr)

# Analyze results
if all_attempts:
    # If multiple attempts agree, use that result
    from collections import Counter
    count = Counter(all_attempts)
    most_common = count.most_common(1)[0]

    if most_common[1] > 1:
        result = most_common[0]
        print(
            f"✅ Consensus result ({most_common[1]} agreements): {result}", file=sys.stderr)
    else:
        result = all_attempts[0]
        print(f"⚠️ No consensus, using first valid: {result}", file=sys.stderr)

    # Save debug info
    debug_info = {
        "image_path": image_path,
        "attempts": all_attempts,
        "result": result,
        "consensus": most_common[1] if most_common[1] > 1 else False
    }

    with open(f"captcha_debug_{os.path.basename(image_path)}.json", "w") as f:
        json.dump(debug_info, f, indent=2)

    # Output only the result
    print(result)
else:
    print("", file=sys.stderr)  # Empty result if all attempts failed

# Clean up temp file if created
if os.path.exists('temp_converted.jpg'):
    os.remove('temp_converted.jpg')
