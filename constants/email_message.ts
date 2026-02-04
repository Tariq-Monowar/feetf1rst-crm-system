export const emailForgotPasswordOTP = (email: string, OTP: string): string => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset Verification</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f9f9f9; font-family: 'Arial', 'Helvetica', sans-serif;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="max-width: 600px; margin: auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 4px; overflow: hidden; margin-top: 40px; margin-bottom: 40px;">
        <tr>
          <td style="padding: 0;">
            <!-- Header -->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td style="background-color: #2c3e50; padding: 30px 40px;">
                  <h1 style="color: #ffffff; font-family: 'Arial', 'Helvetica', sans-serif; font-size: 24px; font-weight: 600; margin: 0; letter-spacing: 0.3px;">FeetF1rst Security</h1>
                </td>
              </tr>
            </table>

            <!-- Document Title -->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td style="padding: 40px 40px 20px;">
                  <h2 style="color: #2c3e50; font-family: 'Arial', 'Helvetica', sans-serif; font-size: 20px; font-weight: 600; margin: 0; border-bottom: 1px solid #e0e0e0; padding-bottom: 15px;">PASSWORD RESET VERIFICATION</h2>
                </td>
              </tr>
            </table>

            <!-- Introduction -->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td style="padding: 0 40px 30px;">
                  <p style="color: #2c3e50; font-size: 15px; line-height: 24px; margin: 0 0 15px;">
                    Dear User,
                  </p>
                  <p style="color: #2c3e50; font-size: 15px; line-height: 24px; margin: 0 0 15px;">
                    We have received a request to reset the password for your FeetF1rst account. To verify your identity and proceed with this request, please use the following One-Time Password (OTP):
                  </p>
                </td>
              </tr>
            </table>
            
            <!-- OTP Box -->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
              
                <td style="padding: 0 40px 30px; text-align: center;">
                  <div style="background-color: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 4px; padding: 20px; display: inline-block; min-width: 200px;">
                    <p style="margin: 0 0 10px; font-size: 14px; font-weight: 600; color: #2c3e50; text-transform: uppercase; letter-spacing: 1px;">
                      Verification Code
                    </p>
                    <p style="margin: 0; font-family: monospace; font-size: 28px; font-weight: 700; color: #2c3e50; letter-spacing: 4px;">
                      ${OTP}
                    </p>
                  </div>
                </td>
              </tr>
            </table>

            <!-- Security Notice -->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td style="padding: 0 40px 30px;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fff9e6; border-left: 4px solid #f1c40f; padding: 15px;">
                    <tr>
                      <td style="padding: 10px 15px;">
                        <p style="color: #7d6608; font-size: 14px; line-height: 21px; margin: 0; font-weight: 500;">
                          <strong>IMPORTANT:</strong> This verification code will expire in 10 minutes. If you did not request a password reset, please disregard this message and consider reviewing your account security.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Instructions -->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td style="padding: 0 40px 30px;">
                  <h3 style="color: #2c3e50; font-size: 16px; font-weight: 600; margin: 0 0 15px; text-transform: uppercase;">Next Steps</h3>
                  <ol style="color: #2c3e50; font-size: 15px; line-height: 24px; margin: 0 0 15px; padding-left: 20px;">
                    <li style="margin-bottom: 10px;">Enter the verification code on the password reset page</li>
                    <li style="margin-bottom: 10px;">Create a new, secure password</li>
                    <li>Log in with your new password</li>
                  </ol>
                </td>
              </tr>
            </table>

            <!-- Closing -->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td style="padding: 0 40px 40px;">
                  <p style="color: #2c3e50; font-size: 15px; line-height: 24px; margin: 0 0 15px;">
                    If you need any assistance, please contact our support team.
                  </p>
                  <p style="color: #2c3e50; font-size: 15px; line-height: 24px; margin: 0 0 5px;">
                    Regards,
                  </p>
                  <p style="color: #2c3e50; font-size: 15px; line-height: 24px; margin: 0 0 5px;">
                    <strong>FeetF1rst Security Team</strong>
                  </p>
                  <p style="color: #2c3e50; font-size: 15px; line-height: 24px; margin: 0;">
                    FeetF1rst Corporation
                  </p>
                </td>
              </tr>
            </table>

            <!-- Footer -->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td style="background-color: #f5f5f5; padding: 20px 40px; text-align: center; border-top: 1px solid #e0e0e0;">
                  <p style="color: #7f8c8d; font-size: 13px; line-height: 20px; margin: 0 0 10px;">
                    This email was sent to ${email}
                  </p>
                  <p style="color: #7f8c8d; font-size: 13px; line-height: 20px; margin: 0;">
                    This is a system-generated email. Please do not reply directly to this message.<br>
                    © 2024 FeetF1rst Corporation. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

export const partnershipWelcomeEmail = (
  email: string,
  setPasswordLink: string,
  busnessName?: string | null,
  vatNumber?: string | null,
  mainLocation?: string | null
): string => {
  const displayBusnessName = busnessName?.trim() || "—";
  const displayVat = vatNumber?.trim() ? vatNumber.trim() : null;
  const displayMainLocation = mainLocation?.trim() || "—";
  return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to FeetF1rst Partnership</title>
        <style type="text/css">
          @media only screen and (max-width: 600px) {
            .header-logo {
              max-width: 180px !important;
              width: 180px !important;
            }
            .header-container {
              padding: 20px 20px !important;
            }
            .header-logo-cell {
              width: 180px !important;
              max-width: 180px !important;
            }
            .header-text-cell {
              padding-left: 20px !important;
              padding-top: 15px !important;
            }
            .header-text {
              font-size: 12px !important;
            }
          }
          @media only screen and (min-width: 601px) {
            .header-text-cell {
              text-align: right !important;
            }
          }
        </style>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f9f9f9; font-family: 'Arial', 'Helvetica', sans-serif;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="max-width: 650px; margin: auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 4px; overflow: hidden; margin-top: 40px; margin-bottom: 40px;">
          <tr>
            <td style="padding: 0;">
              <!-- Document Header -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td class="header-container" style="background-color: rgb(85, 150, 112); padding: 35px 40px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td class="header-logo-cell" style="vertical-align: middle; width: 280px; max-width: 280px;">
                          <img class="header-logo" src="cid:feetf1rst-logo" alt="FeetF1rst Logo" style="max-width: 280px; width: 100%; height: auto; display: block; pointer-events: none; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none;" />
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
                                <strong style="color: #ffffff; font-weight: 600;">Address:</strong> <span style="color: #ffffff; font-weight: 400;">demo state!, 123 hous</span>
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
                  <td style="padding: 40px 40px 20px;">
                    <h2 style="color: #2c3e50; font-family: 'Arial', 'Helvetica', sans-serif; font-size: 20px; font-weight: 600; margin: 0; border-bottom: 1px solid #e0e0e0; padding-bottom: 15px;">Partnerzugang Accountbestätigung</h2>
                  </td>
                </tr>
              </table>
  
              <!-- Document Date -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding: 0 40px 30px;">
                    <p style="color: rgb(85, 150, 112); font-size: 14px; margin: 0;">
                      ${new Date().toLocaleDateString("de-DE", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </td>
                </tr>
              </table>
  
              <!-- Introduction -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding: 0 40px 30px;">
                    <p style="color: #2c3e50; font-size: 15px; line-height: 24px; margin: 0 0 15px;">
                      Guten Tag,
                    </p>
                    <p style="color: #2c3e50; font-size: 15px; line-height: 24px; margin: 0 0 15px;">
                      Guten Tag,
                      willkommen bei FeetF1rst. Mit dieser Nachricht erhalten Sie offiziell die Berechtigung, unsere Partner-Software zu nutzen. Ab jetzt steht Ihnen eine Plattform zur Verfügung, die Prozesse vereinfacht, Entscheidungen beschleunigt und digitale Versorgung auf ein neues Niveau hebt.
                    </p>
                    <p style="color: #2c3e50; font-size: 15px; line-height: 24px; margin: 0;">
                      Ihr Einstieg – Ihre Zugangsdaten:
                    </p>
                  </td>
                </tr>
              </table>
  
              <!-- Partner details table -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding: 0 40px 24px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="1" width="100%" style="border: 1px solid #e0e0e0; border-collapse: collapse;">
                      <tr>
                        <td style="background-color: #f5f5f5; padding: 12px 20px; border: 1px solid #e0e0e0; width: 30%;">
                          <p style="margin: 0; font-size: 14px; font-weight: 600; color: #2c3e50;">Geschäftsname:</p>
                        </td>
                        <td style="padding: 12px 20px; border: 1px solid #e0e0e0;">
                          <p style="margin: 0; font-size: 14px; color: #2c3e50;">${displayBusnessName}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="background-color: #f5f5f5; padding: 12px 20px; border: 1px solid #e0e0e0; width: 30%;">
                          <p style="margin: 0; font-size: 14px; font-weight: 600; color: #2c3e50;">E-Mail:</p>
                        </td>
                        <td style="padding: 12px 20px; border: 1px solid #e0e0e0;">
                          <p style="margin: 0; font-size: 14px; color: #2c3e50;">${email}</p>
                        </td>
                      </tr>
                      ${displayVat ? `
                      <tr>
                        <td style="background-color: #f5f5f5; padding: 12px 20px; border: 1px solid #e0e0e0; width: 30%;">
                          <p style="margin: 0; font-size: 14px; font-weight: 600; color: #2c3e50;">USt-IdNr. / VAT:</p>
                        </td>
                        <td style="padding: 12px 20px; border: 1px solid #e0e0e0;">
                          <p style="margin: 0; font-size: 14px; color: #2c3e50;">${displayVat}</p>
                        </td>
                      </tr>
                      ` : ""}
                      <tr>
                        <td style="background-color: #f5f5f5; padding: 12px 20px; border: 1px solid #e0e0e0; width: 30%;">
                          <p style="margin: 0; font-size: 14px; font-weight: 600; color: #2c3e50;">Hauptstandort:</p>
                        </td>
                        <td style="padding: 12px 20px; border: 1px solid #e0e0e0;">
                          <p style="margin: 0; font-size: 14px; color: #2c3e50;">${displayMainLocation}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
  
              <!-- Set password CTA button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding: 0 40px 32px; text-align: center;">
                    <a href="${setPasswordLink}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: rgb(85, 150, 112); color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-family: 'Segoe UI', 'Roboto', 'Open Sans', 'Helvetica Neue', Arial, sans-serif; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                      Passwort setzen & Zugang aktivieren
                    </a>
                  </td>
                </tr>
              </table>
  
              <!-- Notice -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding: 0 40px 24px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f0f8f4; border-left: 4px solid rgb(85, 150, 112);">
                      <tr>
                        <td style="padding: 12px 15px;">
                          <p style="color: #2c3e50; font-size: 14px; line-height: 21px; margin: 0; font-weight: 500;">
                            <strong>Hinweis:</strong> Klicken Sie auf den Button oben, um Ihr Passwort zu setzen. Der Link ist einmalig gültig.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
  
              <!-- Next Steps -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding: 0 40px 30px;">
                    <h3 style="color: #2c3e50; font-size: 16px; font-weight: 600; margin: 0 0 15px; text-transform: uppercase;">Ihr nächster Schritt</h3>
                    <p style="color: #2c3e50; font-size: 15px; line-height: 24px; margin: 0;">
                      Setzen Sie Ihr Passwort über den Button oben, melden Sie sich anschließend an und richten Sie Ihr Profil ein. Bei Fragen begleiten wir Sie gerne persönlich.
                    </p>
                  </td>
                </tr>
              </table>
  
              <!-- Contact Information -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding: 0 40px 40px;">
                    <h3 style="color: #2c3e50; font-size: 16px; font-weight: 600; margin: 0 0 15px;">Kontaktinformationen</h3>
                     <!--
                      <p style="color: #2c3e50; font-size: 15px; line-height: 24px; margin: 0 0 5px;">
                       Sollten Fragen offen bleiben, begleiten wir Sie gerne persönlich.
                     </p>
                    -->
                    <p style="color: #2c3e50; font-size: 15px; line-height: 24px; margin: 0 0 5px;">
                      <strong>Email:</strong> <a href="mailto:info@feetf1rst.com" style="color: #2980b9; text-decoration: none;">info@feetf1rst.com</a>
                    </p>
               <p style="color: #2c3e50; font-size: 15px; line-height: 24px; margin: 0;">
  <strong>Phone:</strong>
  <a href="https://wa.me/393665087742" style="color: #2c3e50; text-decoration: none;">
    +39 366 508 7742
  </a>
</p>

                  </td>
                </tr>
              </table>
  
              <!-- Closing -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding: 0 40px 40px;">
                    <p style="color: #2c3e50; font-size: 15px; line-height: 24px; margin: 0 0 15px;">
                      Wir freuen uns, Sie als Partner begrüßen zu dürfen.
                    </p>
             
                    <p style="color: #2c3e50; font-size: 15px; line-height: 24px; margin: 0 0 5px;">
                      <strong>Mit freundlichen Grüßen</strong>
                    </p>
                    <p style="color: #2c3e50; font-size: 15px; line-height: 24px; margin: 0;">
                      FeetF1rst Team
                    </p>
                  </td>
                </tr>
              </table>
  
              <!-- Footer -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="background-color:rgb(85, 150, 112); padding: 20px 40px; text-align: center; border-top: 1px solid #e0e0e0;">
                    <p style="color:rgb(255, 255, 255); font-size: 13px; line-height: 20px; margin: 0;">
                      This is a system-generated email. Please do not reply directly to this message.<br>
                      © 2026 FeetF1rst Corporation. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
};

export const newSuggestionEmail = (
  name: string,
  email: string,
  phone: string,
  firma: string,
  suggestion: string
): string => {
  return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ASPAPIC - New Suggestion Notification</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f9f9f9; font-family: 'Arial', 'Helvetica', sans-serif;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="max-width: 600px; margin: auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 4px; overflow: hidden; margin-top: 40px; margin-bottom: 40px;">
          <tr>
            <td style="padding: 0;">
              <!-- Header -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="background-color: #1e3a8a; padding: 30px 40px;">
                    <h1 style="color: #ffffff; font-family: 'Arial', 'Helvetica', sans-serif; font-size: 24px; font-weight: 600; margin: 0; letter-spacing: 0.3px;">ASPAPIC</h1>
                  </td>
                </tr>
              </table>
  
              <!-- Document Title -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding: 40px 40px 20px;">
                    <h2 style="color: #1e3a8a; font-family: 'Arial', 'Helvetica', sans-serif; font-size: 20px; font-weight: 600; margin: 0; border-bottom: 1px solid #e0e0e0; padding-bottom: 15px;">NEW SUGGESTION RECEIVED</h2>
                  </td>
                </tr>
              </table>
  
              <!-- Document Date -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding: 0 40px 30px;">
                    <p style="color: #5d6975; font-size: 14px; margin: 0;">
                      Date: ${new Date().toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </td>
                </tr>
              </table>
  
              <!-- Introduction -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding: 0 40px 30px;">
                    <p style="color: #334155; font-size: 15px; line-height: 24px; margin: 0 0 15px;">
                      A new suggestion has been submitted through the ASPAPIC feedback system. Please find the details below:
                    </p>
                  </td>
                </tr>
              </table>
              
              <!-- Submitter Information -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding: 0 40px 30px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border: 1px solid #e0e0e0; border-collapse: collapse;">
                      <tr>
                        <td style="background-color: #f1f5f9; padding: 12px 20px; border-bottom: 1px solid #e0e0e0; width: 30%;">
                          <p style="margin: 0; font-size: 14px; font-weight: 600; color: #334155;">
                            Name:
                          </p>
                        </td>
                        <td style="padding: 12px 20px; border-bottom: 1px solid #e0e0e0;">
                          <p style="margin: 0; font-size: 14px; color: #334155;">
                            ${name}
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="background-color: #f1f5f9; padding: 12px 20px; border-bottom: 1px solid #e0e0e0; width: 30%;">
                          <p style="margin: 0; font-size: 14px; font-weight: 600; color: #334155;">
                            Email:
                          </p>
                        </td>
                        <td style="padding: 12px 20px; border-bottom: 1px solid #e0e0e0;">
                          <p style="margin: 0; font-size: 14px; color: #334155;">
                            ${email}
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="background-color: #f1f5f9; padding: 12px 20px; border-bottom: 1px solid #e0e0e0; width: 30%;">
                          <p style="margin: 0; font-size: 14px; font-weight: 600; color: #334155;">
                            Phone:
                          </p>
                        </td>
                        <td style="padding: 12px 20px; border-bottom: 1px solid #e0e0e0;">
                          <p style="margin: 0; font-size: 14px; color: #334155;">
                            ${phone}
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="background-color: #f1f5f9; padding: 12px 20px; width: 30%;">
                          <p style="margin: 0; font-size: 14px; font-weight: 600; color: #334155;">
                            Organization:
                          </p>
                        </td>
                        <td style="padding: 12px 20px;">
                          <p style="margin: 0; font-size: 14px; color: #334155;">
                            ${firma}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
  
              <!-- Suggestion Content -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding: 0 40px 30px;">
                    <h3 style="color: #1e3a8a; font-size: 16px; font-weight: 600; margin: 0 0 15px; text-transform: uppercase;">Suggestion Details</h3>
                    <div style="background-color: #f1f5f9; border: 1px solid #e0e0e0; border-radius: 4px; padding: 20px;">
                      <p style="color: #334155; font-size: 15px; line-height: 24px; margin: 0; white-space: pre-line;">
                        ${suggestion}
                      </p>
                    </div>
                  </td>
                </tr>
              </table>
  
              <!-- Notification -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding: 0 40px 30px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px;">
                      <tr>
                        <td style="padding: 10px 15px;">
                          <p style="color: #1e40af; font-size: 14px; line-height: 21px; margin: 0; font-weight: 500;">
                            <strong>NOTE:</strong> This suggestion has been recorded in our system. Thank you for your attention to this feedback.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
  
              <!-- Closing -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding: 0 40px 40px;">
                    <p style="color: #334155; font-size: 15px; line-height: 24px; margin: 0 0 15px;">
                      If you have any questions about this suggestion, please contact our support team.
                    </p>
                    <p style="color: #334155; font-size: 15px; line-height: 24px; margin: 0 0 5px;">
                      Regards,
                    </p>
                    <p style="color: #334155; font-size: 15px; line-height: 24px; margin: 0;">
                      <strong>ASPAPIC Team</strong>
                    </p>
                  </td>
                </tr>
              </table>
  
              <!-- Footer -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="background-color: #f1f5f9; padding: 20px 40px; text-align: center; border-top: 1px solid #e0e0e0;">
                    <p style="color: #64748b; font-size: 13px; line-height: 20px; margin: 0;">
                      This is an automated notification from the ASPAPIC system. Please do not reply to this email.<br>
                      © 2024 ASPAPIC. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
};

export const newImprovementEmail = (
  company: string,
  phone: string,
  reason: string,
  message: string
): string => {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>ASPAPIC - New Improvement Suggestion</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="margin: 0; padding: 0; background-color: #f9f9f9; font-family: 'Arial', 'Helvetica', sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="max-width: 600px; margin: auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 4px; overflow: hidden; margin-top: 40px; margin-bottom: 40px;">
      <tr>
        <td style="padding: 0;">
          <!-- Header -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="background-color: #0f172a; padding: 30px 40px;">
                <h1 style="color: #ffffff; font-size: 24px; margin: 0;">ASPAPIC System Notification</h1>
              </td>
            </tr>
          </table>

          <!-- Title -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="padding: 40px 40px 20px;">
                <h2 style="color: #1e293b; font-size: 20px; margin: 0; border-bottom: 1px solid #e0e0e0; padding-bottom: 15px;">New Improvement Suggestion</h2>
              </td>
            </tr>
          </table>

          <!-- Date -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="padding: 0 40px 30px;">
                <p style="color: #64748b; font-size: 14px; margin: 0;">Submitted on: ${new Date().toLocaleDateString(
                  "en-US",
                  {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  }
                )}</p>
              </td>
            </tr>
          </table>

          <!-- Details -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="padding: 0 40px 30px;">
                <table width="100%" style="border: 1px solid #e2e8f0; border-collapse: collapse;">
                  <tr>
                    <td style="background-color: #f1f5f9; padding: 12px 20px; border-bottom: 1px solid #e2e8f0; width: 30%;">
                      <strong style="font-size: 14px; color: #334155;">Company:</strong>
                    </td>
                    <td style="padding: 12px 20px; border-bottom: 1px solid #e2e8f0;">${company}</td>
                  </tr>
                  <tr>
                    <td style="background-color: #f1f5f9; padding: 12px 20px; border-bottom: 1px solid #e2e8f0;">
                      <strong style="font-size: 14px; color: #334155;">Phone:</strong>
                    </td>
                    <td style="padding: 12px 20px; border-bottom: 1px solid #e2e8f0;">${phone}</td>
                  </tr>
                  <tr>
                    <td style="background-color: #f1f5f9; padding: 12px 20px;">
                      <strong style="font-size: 14px; color: #334155;">Reason:</strong>
                    </td>
                    <td style="padding: 12px 20px;">${reason}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- Message Content -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="padding: 0 40px 30px;">
                <h3 style="color: #1e40af; font-size: 16px; font-weight: 600; margin: 0 0 15px; text-transform: uppercase;">Suggestion Message</h3>
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 20px;">
                  <p style="margin: 0; font-size: 15px; line-height: 24px; color: #334155; white-space: pre-line;">
                    ${message}
                  </p>
                </div>
              </td>
            </tr>
          </table>

          <!-- Info Notice -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="padding: 0 40px 30px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px;">
                  <tr>
                    <td style="padding: 10px 15px;">
                      <p style="color: #1d4ed8; font-size: 14px; margin: 0; font-weight: 500;">
                        <strong>NOTE:</strong> This suggestion has been recorded and forwarded to the internal review team. Thank you for contributing to our platform’s improvement.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- Footer -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="background-color: #f1f5f9; padding: 20px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
                <p style="color: #64748b; font-size: 13px; margin: 0;">
                  This is an automated notification from the ASPAPIC system. Please do not reply.<br>
                  &copy; ${new Date().getFullYear()} ASPAPIC. All rights reserved.
                </p>
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
};

const formatGermanDate = (date: Date) =>
  new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);

const formatGermanTime = (date: Date) =>
  new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date) + " Uhr";

export const adminLoginNotificationEmail = (
  adminEmail: string,
  adminName: string,
  loginDateTime: Date,
  ipAddress: string
): string => {
  const loginDate = formatGermanDate(loginDateTime);
  const loginTime = formatGermanTime(loginDateTime);

  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Admin-Zugriffsbenachrichtigung - FeetF1rst</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); overflow: hidden;">
    
    <tr>
      <td style="background-color: rgb(85, 150, 112); padding: 24px 32px; text-align: center;">
        <h2 style="color: #ffffff; font-size: 22px; margin: 0;">Admin-Panel Zugriff</h2>
      </td>
    </tr>

    <tr>
      <td style="padding: 24px 32px; color: #2c3e50;">
        <p style="font-size: 16px; margin: 0 0 12px;">
          Hallo <strong>${adminName || "Admin"}</strong>,
        </p>
        <p style="font-size: 15px; margin: 0 0 16px;">
          Ihr FeetF1rst-Admin-Konto wurde erfolgreich verwendet.  
          Nachfolgend finden Sie die Anmeldedaten.
        </p>
      </td>
    </tr>

    <tr>
      <td style="padding: 0 32px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e0e0e0; border-radius: 6px; background-color: #f9fafb;">
          <tr>
            <td style="padding: 12px 20px; border-bottom: 1px solid #eee;">
              <strong>E-Mail:</strong> ${adminEmail}
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 20px; border-bottom: 1px solid #eee;">
              <strong>Name:</strong> ${adminName}
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 20px; border-bottom: 1px solid #eee;">
              <strong>Anmeldedatum:</strong> ${loginDate}
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 20px; border-bottom: 1px solid #eee;">
              <strong>Anmeldezeit:</strong> ${loginTime}
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 20px;">
              <strong>IP-Adresse:</strong> ${ipAddress}
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background-color: #f5f6f8; padding: 20px 32px; text-align: center;">
        <p style="font-size: 13px; color: #7f8c8d; margin: 0;">
          FeetF1rst Admin-Benachrichtigungssystem<br>
          &copy; ${new Date().getFullYear()} FeetF1rst Corporation
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

export const sendPdfToEmailTamplate = (pdf: any): string => `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Personalized Foot Exercise Program</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: 'Arial', 'Helvetica', sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="max-width: 650px; margin: auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; margin-top: 40px; margin-bottom: 40px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
      <tr>
        <td style="padding: 0;">
          <!-- Header with Gradient Background -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 40px 30px;">
                <div style="text-align: center;">
                  <h1 style="color: #ffffff; font-size: 28px; font-weight: 700; margin: 0 0 10px; letter-spacing: 0.5px;">FeetF1rst</h1>
                  <p style="color: #ffffff; font-size: 16px; margin: 0; opacity: 0.9;">Professional Foot Care Solutions</p>
                </div>
              </td>
            </tr>
          </table>

          <!-- Main Content -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="padding: 40px 40px 30px;">
                <h2 style="color: #2c3e50; font-size: 24px; font-weight: 600; margin: 0 0 20px; text-align: center;">Your Personalized Foot Exercise Program</h2>
                
                <p style="color: #34495e; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                  Thank you for choosing FeetF1rst for your foot care needs! We're excited to provide you with a comprehensive, personalized exercise program designed specifically for your foot health and recovery.
                </p>

                <!-- Feature Boxes -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0;">
                  <tr>
                    <td style="padding: 0 10px 0 0; width: 50%;">
                      <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; border-radius: 4px;">
                        <h3 style="color: #2c3e50; font-size: 16px; font-weight: 600; margin: 0 0 10px;">🎯 Personalized Plan</h3>
                        <p style="color: #7f8c8d; font-size: 14px; line-height: 1.5; margin: 0;">Tailored exercises based on your specific foot condition and needs</p>
                      </div>
                    </td>
                    <td style="padding: 0 0 0 10px; width: 50%;">
                      <div style="background-color: #f8f9fa; border-left: 4px solid #764ba2; padding: 20px; border-radius: 4px;">
                        <h3 style="color: #2c3e50; font-size: 16px; font-weight: 600; margin: 0 0 10px;">📋 Step-by-Step Guide</h3>
                        <p style="color: #7f8c8d; font-size: 14px; line-height: 1.5; margin: 0;">Detailed instructions with illustrations for each exercise</p>
                      </div>
                    </td>
                  </tr>
                </table>

                <!-- PDF Attachment Notice -->
                <div style="background-color: #e8f4fd; border: 1px solid #bee5eb; border-radius: 6px; padding: 25px; margin: 30px 0; text-align: center;">
                  <div style="margin-bottom: 15px;">
                    <span style="font-size: 48px;">📄</span>
                  </div>
                  <h3 style="color: #0c5460; font-size: 18px; font-weight: 600; margin: 0 0 10px;">Your Exercise Program is Ready!</h3>
                  <p style="color: #0c5460; font-size: 15px; line-height: 1.5; margin: 0 0 15px;">
                    We've attached your personalized foot exercise program as a PDF document. 
                    This comprehensive guide includes all the exercises recommended for your specific condition.
                  </p>
                  <p style="color: #0c5460; font-size: 14px; margin: 0; font-weight: 500;">
                    📎 <strong>Attachment:</strong> ${
                      pdf.originalname || "foot-exercise-program.pdf"
                    }
                  </p>
                </div>

                <!-- Instructions -->
                <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 20px; margin: 30px 0;">
                  <h3 style="color: #856404; font-size: 16px; font-weight: 600; margin: 0 0 15px;">📋 How to Use Your Exercise Program</h3>
                  <ol style="color: #856404; font-size: 14px; line-height: 1.6; margin: 0; padding-left: 20px;">
                    <li style="margin-bottom: 8px;">Download and save the attached PDF to your device</li>
                    <li style="margin-bottom: 8px;">Review the exercise instructions carefully before starting</li>
                    <li style="margin-bottom: 8px;">Follow the recommended frequency and duration for each exercise</li>
                    <li style="margin-bottom: 8px;">Track your progress and note any improvements or concerns</li>
                    <li>Contact us if you experience any discomfort or have questions</li>
                  </ol>
                </div>

                <!-- Benefits Section -->
                <div style="margin: 30px 0;">
                  <h3 style="color: #2c3e50; font-size: 18px; font-weight: 600; margin: 0 0 15px;">✨ Benefits of Your Exercise Program</h3>
                  <ul style="color: #34495e; font-size: 14px; line-height: 1.6; margin: 0; padding-left: 20px;">
                    <li style="margin-bottom: 6px;">Strengthens foot muscles and improves flexibility</li>
                    <li style="margin-bottom: 6px;">Reduces pain and discomfort</li>
                    <li style="margin-bottom: 6px;">Improves balance and stability</li>
                    <li style="margin-bottom: 6px;">Enhances overall foot function</li>
                    <li>Prevents future foot problems</li>
                  </ul>
                </div>

                <!-- Contact Information -->
                <div style="background-color: #f8f9fa; border-radius: 6px; padding: 25px; margin: 30px 0; text-align: center;">
                  <h3 style="color: #2c3e50; font-size: 16px; font-weight: 600; margin: 0 0 15px;">Need Help?</h3>
                  <p style="color: #7f8c8d; font-size: 14px; line-height: 1.5; margin: 0 0 15px;">
                    Our team of foot care specialists is here to support you throughout your recovery journey.
                  </p>
                  <p style="color: #2c3e50; font-size: 14px; margin: 0;">
                    📧 <strong>Email:</strong> support@FeetF1rst.com<br>
                    📞 <strong>Phone:</strong> +1 (555) 123-4567
                  </p>
                </div>
              </td>
            </tr>
          </table>

          <!-- Footer -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="background-color: #2c3e50; padding: 25px 40px; text-align: center;">
                <p style="color: #bdc3c7; font-size: 13px; line-height: 1.5; margin: 0 0 10px;">
                  This email was sent to you as part of your FeetF1rst foot care treatment plan.
                </p>
                <p style="color: #95a5a6; font-size: 12px; margin: 0;">
                  © ${new Date().getFullYear()} FeetF1rst Corporation. All rights reserved.<br>
                  Professional foot care solutions for a healthier tomorrow.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
`;

export const excerciseEmail = (base64String: string): string => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Exercise Program</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        /* Make the PDF viewer take full screen */
        html, body {
          margin: 0;
          padding: 0;
          height: 100%;
        }

        iframe {
          width: 100%;
          height: 100%;
          border: none; /* Remove the default border around the iframe */
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: 'Arial', sans-serif;">
      <iframe src="data:application/pdf;base64,${base64String}"></iframe>
    </body>
    </html>
  `;
};

export const invoiceEmailTemplate = (
  customerName: string,

  total?: number
): string => {
  const formattedTotal =
    typeof total === "number" ? `${total.toFixed(2)} €` : undefined;
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Your Invoice</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f8fa;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;margin:32px auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="background:#111827;padding:20px 28px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">FeetF1rst · Invoice</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:28px;">
          <p style="margin:0 0 12px;font-size:15px;">Hello <strong>${
            customerName || "Customer"
          }</strong>,</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Please find your invoice attached as a PDF.</p>
          ${
            formattedTotal
              ? `<p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>Total:</strong> ${formattedTotal}</p>`
              : ""
          }
          <p style="margin:12px 0 0;font-size:14px;color:#6b7280;">If you have questions about this invoice, reply to this email and we’ll be happy to help.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;text-align:center;">
          © ${new Date().getFullYear()} FeetF1rst. All rights reserved.
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
};
