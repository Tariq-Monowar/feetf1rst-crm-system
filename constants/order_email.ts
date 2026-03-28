/**
 * Email template for custom shaft order notifications.
 * Sent to admin when a partner creates a Massschafterstellung, Komplettfertigung, or Bodenkonstruktion order.
 */

const ADMIN_ORDER_DETAILS_BASE =
  "https://admin.feetf1rst.tech/dashboard/manage-order/details";

export interface CustomShaftOrderEmailPayload {
  orderId: string;
  partnerName: string;
  partnerEmail: string;
  partnerImage?: string | null;
  category: string;
  totalPrice: number | null;
  customerDisplay: string;
  kollektionName?: string | null;
  isCustomModels?: boolean;
  isBodenkonstruktion?: boolean;
  deliveryDate?: string | null;
  createdAt: string;
}

export const customShaftOrderEmailTemplate = (
  payload: CustomShaftOrderEmailPayload
): string => {
  const {
    orderId,
    partnerName,
    partnerEmail,
    partnerImage,
    category,
    totalPrice,
    customerDisplay,
    kollektionName,
    isCustomModels,
    isBodenkonstruktion,
    deliveryDate,
    createdAt,
  } = payload;

  const orderDetailsUrl = `${ADMIN_ORDER_DETAILS_BASE}/${orderId}`;
  const partnerInitial = (partnerName || "P").charAt(0).toUpperCase();
  const totalFormatted =
    totalPrice != null ? `€ ${Number(totalPrice).toFixed(2)}` : "—";
  const categoryLabel =
    category === "Komplettfertigung"
      ? "Komplettfertigung"
      : category === "Massschafterstellung"
        ? "Massschafterstellung"
        : category === "Bodenkonstruktion"
          ? "Bodenkonstruktion"
          : category;

  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Neue Bestellung – FeetF1rst</title>
  <style type="text/css">
    @media only screen and (max-width: 600px) {
      .header-logo { max-width: 180px !important; width: 180px !important; }
      .header-container { padding: 20px 20px !important; }
      .header-logo-cell { width: 180px !important; max-width: 180px !important; }
      .header-text-cell { padding-left: 20px !important; padding-top: 15px !important; }
      .header-text { font-size: 12px !important; }
    }
    @media only screen and (min-width: 601px) {
      .header-text-cell { text-align: right !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#e8f0ec;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e8f0ec;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:650px;margin:auto;background:#ffffff;border:1px solid #e0e0e0;border-radius:4px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:0;">
              <!-- Document Header (same as partnership welcome email) -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td class="header-container" style="background-color: rgb(85, 150, 112); padding: 35px 40px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td class="header-logo-cell" style="vertical-align: middle; width: 280px; max-width: 280px;">
                          <img class="header-logo" src="https://feetf1rst.s3.eu-central-1.amazonaws.com/1772285576878-unnamed.png" alt="FeetF1rst Logo" style="max-width: 280px; width: 100%; height: auto; display: block; pointer-events: none; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none;" />
                        </td>
                        <td class="header-text-cell" style="vertical-align: middle; padding-left: 30px; width: auto; text-align: right;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width: auto; margin-left: auto;">
                            <tr>
                              <td class="header-text" style="padding: 4px 0; color: #ffffff; font-family: 'Segoe UI', 'Roboto', 'Open Sans', 'Helvetica Neue', Arial, sans-serif; font-size: 13px; line-height: 1.5; text-align: left;">
                                <strong style="color: #ffffff; font-weight: 600;">Email:</strong> <a href="mailto:info@feetfirst.com" style="color: #e8f4f8; text-decoration: none; font-weight: 400;">info@feetfirst.com</a>
                              </td>
                            </tr>
                            <tr>
                              <td class="header-text" style="padding: 4px 0; color: #ffffff; font-family: 'Segoe UI', 'Roboto', 'Open Sans', 'Helvetica Neue', Arial, sans-serif; font-size: 13px; line-height: 1.5; text-align: left;">
                                <strong style="color: #ffffff; font-weight: 600;">Phone:</strong> <span style="color: #ffffff; font-weight: 400;">+39 366 508 7742</span>
                              </td>
                            </tr>
                            <tr>
                              <td class="header-text" style="padding: 4px 0; color: #ffffff; font-family: 'Segoe UI', 'Roboto', 'Open Sans', 'Helvetica Neue', Arial, sans-serif; font-size: 13px; line-height: 1.5; text-align: left;">
                                <strong style="color: #ffffff; font-weight: 600;">Address:</strong> <span style="color: #ffffff; font-weight: 400;">Pipen 5, Bruneck 39031 Italien</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <!-- Document Title -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding: 24px 40px 16px;">
                    <h2 style="color: #2c3e50; font-family: 'Arial', 'Helvetica', sans-serif; font-size: 20px; font-weight: 600; margin: 0; border-bottom: 1px solid #e0e0e0; padding-bottom: 15px;">Neue Partnerbestellung</h2>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- CTA Button -->
          <tr>
            <td style="padding:28px 40px 8px;text-align:center;">
              <a href="${orderDetailsUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#1a3d32;color:#ffffff !important;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.15);">
                Bestellung im Admin öffnen →
              </a>
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="padding:24px 40px 8px;border-bottom:1px solid #e8eeeb;">
              <h2 style="margin:0;color:#1a1a1a;font-size:16px;font-weight:600;">Bestelldetails</h2>
            </td>
          </tr>
          <!-- Order summary -->
          <tr>
            <td style="padding:20px 40px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8faf9;border:1px solid #e8eeeb;border-radius:10px;">
                <tr>
                  <td style="padding:18px 22px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr><td style="padding:6px 0;color:#5c6b6a;font-size:12px;font-weight:600;">Kategorie</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${categoryLabel}</td></tr>
                      <tr><td style="padding:6px 0;color:#5c6b6a;font-size:12px;font-weight:600;">Gesamtpreis</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${totalFormatted}</td></tr>
                      <tr><td style="padding:6px 0;color:#5c6b6a;font-size:12px;font-weight:600;">Kunde</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${customerDisplay}</td></tr>
                      ${kollektionName ? `<tr><td style="padding:6px 0;color:#5c6b6a;font-size:12px;font-weight:600;">Maßschaft Kollektion</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${kollektionName}</td></tr>` : ""}
                      ${isCustomModels ? `<tr><td style="padding:6px 0;color:#5c6b6a;font-size:12px;font-weight:600;">Modell</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">Eigenes Modell (Custom)</td></tr>` : ""}
                      ${isBodenkonstruktion && deliveryDate ? `<tr><td style="padding:6px 0;color:#5c6b6a;font-size:12px;font-weight:600;">Lieferdatum</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${deliveryDate}</td></tr>` : ""}
                      <tr><td style="padding:6px 0;color:#5c6b6a;font-size:12px;font-weight:600;">Erstellt am</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${createdAt}</td></tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Partner -->
          <tr>
            <td style="padding:0 40px 24px;">
              <h3 style="margin:0 0 10px;color:#1a1a1a;font-size:14px;font-weight:600;">Partner</h3>
              <table role="presentation" cellspacing="0" cellpadding="0" style="border:1px solid #e8eeeb;border-radius:8px;width:100%;">
                <tr>
                  <td style="padding:14px 18px;vertical-align:middle;width:52px;">
                    ${
                      partnerImage
                        ? `<img src="${partnerImage}" alt="" width="44" height="44" style="display:block;width:44px;height:44px;border-radius:50%;object-fit:cover;" />`
                        : `<div style="width:44px;height:44px;border-radius:50%;background:rgb(85, 150, 112);color:#ffffff;font-size:18px;font-weight:600;text-align:center;line-height:44px;">${partnerInitial}</div>`
                    }
                  </td>
                  <td style="padding:14px 18px 14px 8px;vertical-align:middle;">
                    <p style="margin:0 0 4px;color:#1a1a1a;font-size:14px;"><strong>${partnerName}</strong></p>
                    <p style="margin:0;"><a href="mailto:${partnerEmail}" style="color:rgb(85, 150, 112);text-decoration:none;font-size:14px;">${partnerEmail}</a></p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f0f4f2;padding:18px 40px;text-align:center;border-top:1px solid #e8eeeb;">
              <p style="margin:0;color:#7a8a88;font-size:12px;line-height:1.5;">
                Automatische Benachrichtigung · FeetF1rst CRM · © ${new Date().getFullYear()} FeetF1rst
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};
