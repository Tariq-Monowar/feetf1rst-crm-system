/**
 * Email template for "Request for Leistenerstellung access".
 * Sent to admin when a partner requests access to Leistenerstellung.
 */

export interface LeistenerstellungAccessEmailPayload {
  partnerName: string;
  partnerEmail: string;
  partnerImage?: string | null;
  busnessName?: string | null;
  phone?: string | null;
  mainLocation?: string | string[] | null;
  /** Base URL for the admin dashboard (from APP_URL_DEVELOPMENT or APP_URL_PRODUCTION). Set by email service. */
  dashboardBaseUrl?: string;
}

export const leistenerstellungAccessEmailTemplate = (
  payload: LeistenerstellungAccessEmailPayload
): string => {
  const {
    partnerName,
    partnerEmail,
    partnerImage,
    busnessName,
    phone,
    mainLocation,
    dashboardBaseUrl,
  } = payload;

  const partnerInitial = (partnerName || busnessName || "P").charAt(0).toUpperCase();
  const displayBusnessName = busnessName?.trim() || "—";
  const displayPhone = phone?.trim() || "—";
  const displayMainLocation = Array.isArray(mainLocation)
    ? mainLocation.filter(Boolean).join(", ") || "—"
    : mainLocation?.trim() || "—";
  const base = (dashboardBaseUrl || "").replace(/\/$/, "");
  const roleManagementUrl = base ? `${base}/dashboard/role-management` : "#";

  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Anfrage Leistenerstellung-Zugang – FeetF1rst</title>
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
              <!-- Header -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td class="header-container" style="background-color: rgb(85, 150, 112); padding: 35px 40px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td class="header-logo-cell" style="vertical-align: middle; width: 280px; max-width: 280px;">
                          <img class="header-logo" src="https://feetf1rst.s3.eu-central-1.amazonaws.com/1772285576878-unnamed.png" alt="FeetF1rst Logo" style="max-width: 280px; width: 100%; height: auto; display: block;" />
                        </td>
                        <td class="header-text-cell" style="vertical-align: middle; padding-left: 30px; width: auto; text-align: right;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width: auto; margin-left: auto;">
                            <tr>
                              <td class="header-text" style="padding: 4px 0; color: #ffffff; font-size: 13px; line-height: 1.5; text-align: left;">
                                <strong style="color: #ffffff; font-weight: 600;">Email:</strong> <a href="mailto:info@feetfirst.com" style="color: #e8f4f8; text-decoration: none;">info@feetfirst.com</a>
                              </td>
                            </tr>
                            <tr>
                              <td class="header-text" style="padding: 4px 0; color: #ffffff; font-size: 13px; line-height: 1.5; text-align: left;">
                                <strong style="color: #ffffff; font-weight: 600;">Phone:</strong> <span style="color: #ffffff;">+39 366 508 7742</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <!-- Title -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding: 24px 40px 16px;">
                    <h2 style="color: #2c3e50; font-size: 20px; font-weight: 600; margin: 0; border-bottom: 1px solid #e0e0e0; padding-bottom: 15px;">Anfrage: Zugang Leistenerstellung</h2>
                  </td>
                </tr>
              </table>
              <!-- Message -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding: 0 40px 20px;">
                    <p style="color: #2c3e50; font-size: 15px; line-height: 24px; margin: 0 0 12px;">
                      Ein Partner hat eine Anfrage gesendet:
                    </p>
                    <div style="background-color: #f0f8f4; border-left: 4px solid rgb(85, 150, 112); padding: 18px 20px; border-radius: 6px;">
                      <p style="color: #2c3e50; font-size: 15px; line-height: 24px; margin: 0; font-weight: 600;">
                        „I need this Leistenerstellung access!“
                      </p>
                      <p style="color: #5c6b6a; font-size: 14px; line-height: 22px; margin: 10px 0 0;">
                        Der Partner bittet um Freischaltung des Leistenerstellung-Zugangs. Bitte prüfen Sie die Partner-Daten unten und erteilen Sie den Zugang über die Rollenverwaltung.
                      </p>
                    </div>
                  </td>
                </tr>
              </table>
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding: 8px 40px 24px; text-align: center;">
                    <a href="${roleManagementUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: rgb(85, 150, 112); color: #ffffff !important; text-decoration: none; font-size: 15px; font-weight: 600; padding: 14px 28px; border-radius: 8px; box-shadow: 0 2px 8px rgba(85, 150, 112, 0.3);">
                      Zugang in Rollenverwaltung prüfen →
                    </a>
                  </td>
                </tr>
              </table>
              <!-- Partner details (Business name as primary identifier) -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding: 0 40px 24px;">
                    <h3 style="margin: 0 0 14px; color: #1a1a1a; font-size: 15px; font-weight: 600;">Partner-Daten</h3>
                    <table role="presentation" cellspacing="0" cellpadding="0" style="border: 1px solid #e8eeeb; border-radius: 8px; width: 100%;">
                      <tr>
                        <td style="padding: 14px 18px; vertical-align: middle; width: 52px;">
                          ${
                            partnerImage
                              ? `<img src="${partnerImage}" alt="" width="44" height="44" style="display:block;width:44px;height:44px;border-radius:50%;object-fit:cover;" />`
                              : `<div style="width:44px;height:44px;border-radius:50%;background:rgb(85, 150, 112);color:#ffffff;font-size:18px;font-weight:600;text-align:center;line-height:44px;">${partnerInitial}</div>`
                          }
                        </td>
                        <td style="padding: 14px 18px 14px 8px; vertical-align: middle;">
                          <p style="margin: 0 0 4px; color: #1a1a1a; font-size: 15px; font-weight: 600;">${displayBusnessName}</p>
                          <p style="margin: 0 0 2px; color: #5c6b6a; font-size: 14px;">${partnerName || "—"}</p>
                          <p style="margin: 0;"><a href="mailto:${partnerEmail}" style="color: rgb(85, 150, 112); text-decoration: none; font-size: 14px;">${partnerEmail}</a></p>
                        </td>
                      </tr>
                    </table>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top: 12px; border: 1px solid #e8eeeb; border-collapse: collapse; border-radius: 8px;">
                      <tr>
                        <td style="background-color: #f8faf9; padding: 12px 18px; width: 28%; font-size: 13px; font-weight: 600; color: #5c6b6a;">Geschäftsname</td>
                        <td style="padding: 12px 18px; font-size: 14px; color: #1a1a1a;">${displayBusnessName}</td>
                      </tr>
                      <tr>
                        <td style="background-color: #f8faf9; padding: 12px 18px; font-size: 13px; font-weight: 600; color: #5c6b6a;">Ansprechpartner</td>
                        <td style="padding: 12px 18px; font-size: 14px; color: #1a1a1a;">${partnerName || "—"}</td>
                      </tr>
                      <tr>
                        <td style="background-color: #f8faf9; padding: 12px 18px; font-size: 13px; font-weight: 600; color: #5c6b6a;">E-Mail</td>
                        <td style="padding: 12px 18px; font-size: 14px;"><a href="mailto:${partnerEmail}" style="color: rgb(85, 150, 112); text-decoration: none;">${partnerEmail}</a></td>
                      </tr>
                      <tr>
                        <td style="background-color: #f8faf9; padding: 12px 18px; font-size: 13px; font-weight: 600; color: #5c6b6a;">Telefon</td>
                        <td style="padding: 12px 18px; font-size: 14px; color: #1a1a1a;">${displayPhone}</td>
                      </tr>
                      <tr>
                        <td style="background-color: #f8faf9; padding: 12px 18px; font-size: 13px; font-weight: 600; color: #5c6b6a;">Hauptstandort</td>
                        <td style="padding: 12px 18px; font-size: 14px; color: #1a1a1a;">${displayMainLocation}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <!-- Footer -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
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
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};
