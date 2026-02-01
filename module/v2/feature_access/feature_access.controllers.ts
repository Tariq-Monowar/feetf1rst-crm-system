import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";

const prisma = new PrismaClient();

const defaultFeatureAccessData = {
  dashboard: true,
  teamchat: true,
  kundensuche: true,
  neukundenerstellung: true,
  einlagenauftrage: true,
  massschuhauftrage: true,
  massschafte: true,
  produktverwaltung: true,
  sammelbestellungen: true,
  nachrichten: true,
  terminkalender: true,
  monatsstatistik: true,
  mitarbeitercontrolling: true,
  einlagencontrolling: true,
  fusubungen: true,
  musterzettel: true,
  einstellungen: true,
  news_and_aktuelles: true,
  produktkatalog: true,
  balance: true,
};

export const getFeatureAccess = async (req: Request, res: Response) => {
  try {
    const { partnerId } = req.params;

    const partner = await prisma.user.findUnique({
      where: { id: partnerId, role: "PARTNER" },
    });

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      });
    }

    let featureAccess = await prisma.featureAccess.findUnique({
      where: { partnerId },
    });

    // If not exists, create with defaults
    if (!featureAccess) {
      featureAccess = await prisma.featureAccess.create({
        data: {
          partnerId,
          ...defaultFeatureAccessData,
        },
      });
    }

    res.status(200).json({
      success: true,
      message: "Feature access retrieved successfully",
      data: featureAccess,
    });
  } catch (error) {
    console.error("Get Feature Access error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const manageFeatureAccess = async (req: Request, res: Response) => {
  try {
    const { partnerId } = req.params;
    const updates = req.body;

    // Check if partner exists
    const partner = await prisma.user.findUnique({
      where: { id: partnerId, role: "PARTNER" },
    });

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      });
    }

    const featureAccess = await prisma.featureAccess.upsert({
      where: { partnerId },
      update: updates,
      create: {
        partnerId,
        ...defaultFeatureAccessData,
        ...updates,
      },
    });

    res.status(200).json({
      success: true,
      message: "Feature access updated successfully",
      data: featureAccess,
    });
  } catch (error) {
    console.error("Manage Feature Access error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const partnerFeatureAccess = async (req: Request, res: Response) => {
  try {
    console.log("partnerFeatureAccess");
    const partnerId = req.user.id;

    // Check if partner exists
    const partner = await prisma.user.findUnique({
      where: { id: partnerId, role: "PARTNER" },
    });

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      });
    }

    // Get or create feature access
    let featureAccess = await prisma.featureAccess.findUnique({
      where: { partnerId },
    });

    // If not exists, create with defaults
    if (!featureAccess) {
      featureAccess = await prisma.featureAccess.create({
        data: {
          partnerId,
          ...defaultFeatureAccessData,
        },
      });
    } else {
      // Update existing record if it's missing the new fields
      const needsUpdate = 
        featureAccess.news_and_aktuelles === null || 
        featureAccess.news_and_aktuelles === undefined ||
        featureAccess.produktkatalog === null || 
        featureAccess.produktkatalog === undefined ||
        featureAccess.balance === null || 
        featureAccess.balance === undefined;

      if (needsUpdate) {
        featureAccess = await prisma.featureAccess.update({
          where: { partnerId },
          data: {
            news_and_aktuelles: featureAccess.news_and_aktuelles ?? true,
            produktkatalog: featureAccess.produktkatalog ?? true,
            balance: featureAccess.balance ?? true,
          },
        });
      }
    }

    // Convert to your desired JSON format
    const formattedData = convertToJSONFormat(featureAccess);

    res.status(200).json({
      success: true,
      message: "Feature access retrieved successfully",
      data: formattedData,
    });
  } catch (error) {
    console.error("Partner Feature Access error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};


function convertToJSONFormat(featureAccess: any) {
  const fieldMapping = [
    { field: "dashboard", title: "Dashboard", path: "/dashboard" },
    { field: "teamchat", title: "Teamchat", path: "/dashboard/teamchat" },
    {
      field: "kundensuche",
      title: "Kundensuche",
      path: "/dashboard/customers",
    },
    {
      field: "neukundenerstellung",
      title: "Neukundenerstellung",
      path: "/dashboard/neukundenerstellung",
    },
    {
      field: "einlagenauftrage",
      title: "Einlagenaufträge",
      path: "/dashboard/orders",
    },
    {
      field: "massschuhauftrage",
      title: "Maßschuhaufträge",
      path: "/dashboard/massschuhauftraege",
    },
    {
      field: "massschafte",
      title: "Maßschäfte",
      path: "/dashboard/custom-shafts",
    },
    {
      field: "produktverwaltung",
      title: "Produktverwaltung",
      path: "/dashboard/lager",
    },
    {
      field: "sammelbestellungen",
      title: "Sammelbestellungen",
      path: "/dashboard/group-orders",
    },
    {
      field: "nachrichten",
      title: "Nachrichten",
      path: "/dashboard/email/inbox",
    },
    {
      field: "terminkalender",
      title: "Terminkalender",
      path: "/dashboard/calendar",
    },
    {
      field: "monatsstatistik",
      title: "Monatsstatistik",
      path: "/dashboard/monatsstatistik",
    },
    {
      field: "mitarbeitercontrolling",
      title: "Mitarbeitercontrolling",
      path: "/dashboard/mitarbeitercontrolling",
    },
    {
      field: "einlagencontrolling",
      title: "Einlagencontrolling",
      path: "/dashboard/einlagencontrolling",
    },
    {
      field: "fusubungen",
      title: "Fußübungen",
      path: "/dashboard/foot-exercises",
    },
    {
      field: "musterzettel",
      title: "Musterzettel",
      path: "/dashboard/musterzettel",
    },
    {
      field: "einstellungen",
      title: "Einstellungen",
      path: "/dashboard/settings",
    },
    {
      field: "news_and_aktuelles",
      title: "News & Aktuelles",
      path: "/dashboard/news",
    },
    {
      field: "produktkatalog",
      title: "Produktkatalog",
      path: "/dashboard/products",
    },
    {
      field: "balance",
      title: "Balance",
      path: "/dashboard/balance-dashboard",
    },
  ];

  const result = [];

  for (const mapping of fieldMapping) {
    // Get action value, defaulting to true if undefined/null
    // This handles cases where new fields might not exist in older database records
    const actionValue = featureAccess[mapping.field] ?? true;

    const item: any = {
      title: mapping.title,
      action: actionValue,
      path: mapping.path,
      nested: [],
    };

    // // ALWAYS add nested items for settings, regardless of parent action value
    if (mapping.field === "einstellungen") {
      // Pass the parent action value (true/false) to determine nested items' actions
      item.nested = getSettingsNestedItems(featureAccess.einstellungen);
    }

    result.push(item);
  }

  return result;
}

// Helper function: Get nested settings items
function getSettingsNestedItems(parentAction: boolean) {
  // Nested settings list
  const settingsNested = [
    { title: "Grundeinstellungen", path: "/dashboard/settings-profile" },
    {
      title: "Backup Einstellungen",
      path: "/dashboard/settings-profile/backup",
    },
    {
      title: "Kundenkommunikation",
      path: "/dashboard/settings-profile/communication",
    },
    {
      title: "Werkstattzettel",
      path: "/dashboard/settings-profile/werkstattzettel",
    },
    {
      title: "Benachrichtigungen",
      path: "/dashboard/settings-profile/benachrichtigungen",
    },
    {
      title: "Lagereinstellungen",
      path: "/dashboard/settings-profile/notifications",
    },
    {
      title: "Preisverwaltung",
      path: "/dashboard/settings-profile/preisverwaltung",
    },
    {
      title: "Software Scanstation",
      path: "/dashboard/settings-profile/software-scanstation",
    },
    { title: "Design & Logo", path: "/dashboard/settings-profile/design" },
    {
      title: "Passwort ändern",
      path: "/dashboard/settings-profile/changes-password",
    },
    { title: "Sprache", path: "/dashboard/settings-profile/sprache" },
    { title: "Fragen", path: "/dashboard/settings-profile/fragen" },
    {
      title: "Automatische Orders",
      path: "/dashboard/settings-profile/automatische-orders",
    },
  ];

  // ALWAYS return all nested items, but set their action based on parent
  return settingsNested.map((item) => ({
    ...item,
    action: parentAction, // If parent is false, all nested items will have action: false
  }));
}
