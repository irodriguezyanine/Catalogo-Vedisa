export function formatClpDisplayAmount(amount: number): string {
  const rounded = Math.round(amount);
  const formatted = rounded.toLocaleString("es-CL");
  return `$ ${formatted}`;
}

export function buildDefaultVentaDirectaExtendedDescription(
  averagePublicationPriceClp?: number | null,
): string {
  const priceLine =
    averagePublicationPriceClp != null && averagePublicationPriceClp > 0
      ? `Precio Promedio Publicación Modelo: ${formatClpDisplayAmount(averagePublicationPriceClp)}`
      : "Precio Promedio Publicación Modelo:";

  return `<div style="background:#ffe9b3;padding:12px 16px;border-radius:6px;margin-bottom:16px;"><strong style="color:#7c2d12;font-size:1.05em;">${priceLine}</strong></div>
<p>¿Quieres comprar este vehículo en <strong>Venta Directa</strong>?</p>
<p>Sigue estos pasos sencillos:</p>
<ol>
<li>Ingresa a nuestra web con tu usuario registrado.</li>
<li>Selecciona el vehículo en <strong>Venta Directa</strong> que deseas adquirir.</li>
<li>Revisa el detalle de valores:
<ul>
<li>Vehículos <strong>operativos</strong>: Valor publicado + gastos de impuesto y transferencia.</li>
<li>Vehículos considerados <strong>chatarra</strong>: Valor publicado + gastos administrativos + 19% de IVA.</li>
</ul>
</li>
<li>Una vez confirmada tu compra, deberás Realizar la transferencia por el monto total y envíar el comprobante a nuestro Contact Center vía WhatsApp al <a href="https://wa.me/56989323397" target="_blank" rel="noopener noreferrer"><strong>+56 9 8932 3397</strong></a>.</li>
<li>Una vez confirmado el pago, te enviaremos la guía de despacho y carta tag a tu correo electrónico, documentos necesarios para retirar el vehículo desde nuestra bodega.</li>
<li>Retira tu vehículo en los horarios establecidos de bodega, entregando la documentación correspondiente.</li>
</ol>
<p><strong>Importante:</strong><br />Este lote corresponde a una pérdida de Compañía de Seguros, que comercializamos de forma directa y exclusiva.</p>
<p>En nuestro portal encontrarás material audiovisual e información detallada de cada vehículo, asegurando transparencia total en el proceso.</p>
<p>Si deseas ver el vehículo presencialmente antes de comprarlo, puedes hacerlo en la ubicación y horarios de exhibición establecidos, previa coordinación con nuestro Contact Center.</p>`;
}
