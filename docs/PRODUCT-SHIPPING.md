# Domicilio de productos (catálogo Excelenter)

| Zona | Valor informativo |
| --- | --- |
| Dentro del perímetro urbano de Cali | **$10.000** |
| Fuera del perímetro urbano de Cali y zonas aledañas | **$20.000** |
| Fuera de las zonas configuradas / dirección no determinada | «Consultar disponibilidad y costo de entrega» |

- **No se cobra en la app.** El valor es informativo; el cierre y la dirección se acuerdan por WhatsApp («¿En qué dirección deseas recibirlo?»). Siempre se muestra «La tarifa final se confirma según la dirección. Valor sujeto a verificación».
- **Separado de los servicios técnicos.** Los servicios siguen usando `coverage_areas` y sus tarifas. Los productos usan constantes propias en `src/lib/catalog/config.ts` (`PRODUCT_SHIPPING_CALI_URBAN`, `PRODUCT_SHIPPING_CALI_OUTSIDE`); no hay una variable global compartida.

## Validación geográfica
La tarifa **nunca** se deduce del texto «Cali» que escriba el cliente. La referencia es el dataset oficial **«POT - Perímetro urbano»** de la Alcaldía de Santiago de Cali (DAPM, CC BY-SA, <https://datos.cali.gov.co/dataset/pot-perimetro-urbano>), descargado del servicio WFS del Geoportal IDESC (`pot_2014:bcs_lim_perimetro_urbano`), reproyectado a WGS84 y simplificado a ~3 m (16 086 → 1 413 vértices) en `src/data/cali-urban-perimeter.json`.

`quoteProductShipping({ lat, lng })` (`src/lib/catalog/shipping.ts`): punto dentro del polígono → $10.000; fuera pero a ≤ 30 km del perímetro → $20.000; coordenadas ausentes, inválidas, fuera de Colombia o más lejos → sin tarifa (confirmar manualmente). Pruebas en `tests/unit/catalog-excelenter.test.ts` con puntos reales (centro de Cali, Jamundí, Yumbo, Medellín).

## Pendiente de decisión (no improvisado)
1. **Geocodificación:** convertir una dirección en coordenadas requiere un proveedor (Google Geocoding, Mapbox, etc.) con credenciales y condiciones de uso. Mientras no se elija, la tienda solo muestra las tarifas informativas y la dirección se valida a mano por WhatsApp.
2. **«Zonas aledañas»:** el límite de 30 km (`MAX_OUTSIDE_KM`) es una suposición técnica; el negocio debe confirmar qué municipios/zonas cubre el valor de $20.000.
