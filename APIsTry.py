import requests
import json


def consultar_hacienda(identificacion):
    url = f"https://api.hacienda.go.cr/fe/ae?identificacion={identificacion}"

    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()

        data = response.json()

        print(f"\n📄 Resultado para identificación {identificacion}:\n")
        # Pretty print con tildes y sangría
        print(json.dumps(data, indent=4, ensure_ascii=False))
        print("-" * 80)

    except requests.exceptions.HTTPError as http_err:
        print(f"HTTP error para {identificacion}: {http_err}")
    except requests.exceptions.ConnectionError:
        print(f"Error de conexión para {identificacion}")
    except requests.exceptions.Timeout:
        print(f"Timeout consultando {identificacion}")
    except Exception as err:
        print(f"Error inesperado para {identificacion}: {err}")


# Lista de identificaciones a probar
identificaciones = [
    "3101151439",
    "304630092",
    "110600078"  # Nueva identificación agregada
]

for id_cliente in identificaciones:
    consultar_hacienda(id_cliente)
