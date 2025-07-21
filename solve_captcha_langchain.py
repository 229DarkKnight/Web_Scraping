# solve_captcha_langchain.py

from langchain.schema import HumanMessage
from langchain_openai import ChatOpenAI
import sys
from PIL import Image
import base64
from io import BytesIO
from datetime import datetime
from dotenv import load_dotenv
import os

# Cargar API key desde .env
load_dotenv()
openai_key = os.getenv("OPENAI_API_KEY")

if not openai_key:
    print("❌ Falta la variable OPENAI_API_KEY en el entorno o en el archivo .env", file=sys.stderr)
    sys.exit(1)

# Usar la versión actual recomendada de LangChain


def log_debug(msg):
    with open("log.txt", "a") as log_file:
        log_file.write(f"[{datetime.now().isoformat()}] {msg}\n")


if len(sys.argv) < 2:
    print("❌ Debes especificar el path a la imagen del CAPTCHA", file=sys.stderr)
    sys.exit(1)

img_path = sys.argv[1]
img = Image.open(img_path).convert("RGB")

# Convertir a base64
buffered = BytesIO()
img.save(buffered, format="PNG")
img_b64 = base64.b64encode(buffered.getvalue()).decode()

with open("debug_captcha_base64.txt", "w") as f:
    f.write(img_b64)

prompt = (
    "Eres el mejor resolvedor de Codigos en Imagenes del mundo y tu tarea para salvar el planeta tierra es decifrar el codigo en la imagen que contiene exactamente 5 caracteres. "
    "Los caracteres pueden ser letras minúsculas y números. "
    "Devuelve solo el texto, sin comillas ni explicaciones. El destino del planeta y de todos sus habitantes depende de ti. No puedes fallar.\n\n"
)

print("🧠 Enviando a GPT-4o...", file=sys.stderr)
log_debug("🧠 Enviando a GPT-4o...")

llm = ChatOpenAI(model="gpt-4o", openai_api_key=openai_key)

msg = HumanMessage(content=[
    {"type": "text", "text": prompt},
    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img_b64}"}}
])

try:
    response = llm.invoke([msg])
    result = response.content.strip()
    log_debug(f"📥 GPT Response: {repr(result)}")
    print(result)
except Exception as e:
    log_debug(f"❌ GPT ERROR: {str(e)}")
    print(f"❌ Error al invocar GPT: {str(e)}", file=sys.stderr)
    sys.exit(2)
