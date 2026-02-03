import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";

const prisma = new PrismaClient();

const defaultEmployeeFeatureAccessData = {
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
  automatisierte_nachrichten: true,
  kasse_and_abholungen: true,
  finanzen_and_kasse: true,
  einnahmen_and_rechnungen: true,
};

const validateEmployee = async (employeeId: string, partnerId: string) => {
  const employee = await prisma.employees.findFirst({
    where: {
      id: employeeId,
      partnerId: partnerId,
    },
  });
  return employee;
};

const defaultPartnerFeatureAccessData = {
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
  automatisierte_nachrichten: true,
  kasse_and_abholungen: true,
  finanzen_and_kasse: true,
  einnahmen_and_rechnungen: true,
};

const FEATURE_KEYS = Object.keys(
  defaultEmployeeFeatureAccessData,
) as (keyof typeof defaultEmployeeFeatureAccessData)[];

const getPartnerFeatureAccess = async (partnerId: string) => {
  const featureAccess = await prisma.featureAccess.findUnique({
    where: { partnerId },
  });
  return featureAccess;
};

/** Get or create partner's FeatureAccess (same as v2) so partner can distribute features. */
const getOrCreatePartnerFeatureAccess = async (partnerId: string) => {
  let featureAccess = await prisma.featureAccess.findUnique({
    where: { partnerId },
  });

  if (!featureAccess) {
    featureAccess = await prisma.featureAccess.create({
      data: {
        partnerId,
        ...defaultPartnerFeatureAccessData,
      },
    });
  }

  return featureAccess;
};

/** Extract only feature boolean fields from a record (e.g. FeatureAccess or employee_feature_access). */
const getFeatureSlice = (record: Record<string, unknown>): Record<string, boolean> => {
  const slice: Record<string, boolean> = {};
  for (const key of FEATURE_KEYS) {
    slice[key] = Boolean(record[key]);
  }
  return slice;
};

/**
 * Effective access = partner access ∩ employee access.
 * If admin turned off a feature for partner, employee loses it regardless of employee_feature_access.
 */
const getEffectiveFeatureAccess = (
  partnerSlice: Record<string, boolean>,
  employeeSlice: Record<string, boolean>,
) => {
  const effective: Record<string, boolean> = {};
  for (const key of FEATURE_KEYS) {
    effective[key] = (partnerSlice[key] ?? false) && (employeeSlice[key] ?? false);
  }
  return effective;
};

const getOrCreateEmployeeFeatureAccess = async (
  employeeId: string,
  partnerId: string,
) => {
  let employeeFeatureAccess = await prisma.employee_feature_access.findFirst({
    where: {
      employeeId,
      partnerId,
    },
  });

  if (!employeeFeatureAccess) {
    const partnerFeatureAccess = await getOrCreatePartnerFeatureAccess(partnerId);

    const initialData: Record<string, boolean> = {};
    FEATURE_KEYS.forEach((key) => {
      initialData[key] = partnerFeatureAccess[key] ?? false;
    });

    return await prisma.employee_feature_access.create({
      data: {
        employeeId,
        partnerId,
        ...initialData,
      },
    });
  }

  return employeeFeatureAccess;
};

const convertToJSONFormat = (featureAccess: any) => {
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
    {
      field: "automatisierte_nachrichten",
      title: "Automatisierte Nachrichten",
      path: "/dashboard/automatisierte-nachrichten",
    },
    {
      field: "kasse_and_abholungen",
      title: "Kasse & Abholungen",
      path: "/dashboard/kasse",
    },
    {
      field: "finanzen_and_kasse",
      title: "Finanzen & Kasse",
      path: "/dashboard/finanzen-kasse",
    },
    {
      field: "einnahmen_and_rechnungen",
      title: "Einnahmen & Rechnungen",
      path: "/dashboard/einnahmen",
    },
  ];

  const result = [];

  for (const mapping of fieldMapping) {
    const actionValue = featureAccess[mapping.field] ?? false;

    const item: any = {
      title: mapping.title,
      action: actionValue,
      path: mapping.path,
      nested: [],
    };

    if (mapping.field === "einstellungen") {
      item.nested = getSettingsNestedItems(featureAccess.einstellungen);
    }

    result.push(item);
  }

  return result;
};

function getSettingsNestedItems(parentAction: boolean) {
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

  return settingsNested.map((item) => ({
    ...item,
    action: parentAction,
  }));
}

export const getPartnerAvailableFeatures = async (
  req: Request,
  res: Response,
) => {
  try {
    const partnerId = req.user.id;

    // Get or create so partner can see what they can distribute (admin may later reduce)
    const partnerFeatureAccess = await getOrCreatePartnerFeatureAccess(partnerId);

    const formattedData = convertToJSONFormat(partnerFeatureAccess);

    res.status(200).json({
      success: true,
      message: "Partner feature access retrieved successfully",
      data: formattedData,
    });
  } catch (error: any) {
    console.error("Get Partner Available Features error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

/**
 * Get current employee's own feature access (effective = partner ∩ employee).
 * Use with EMPLOYEE token; same response shape as partner-feature / getEmployeeFeatureAccess.
 */
export const getMyFeatureAccess = async (req: Request, res: Response) => {
  try {
    const employeeId = req.user.id;

    const employee = await prisma.employees.findUnique({
      where: { id: employeeId },
    });
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const partnerId = employee.partnerId;
    const partnerFeatureAccess = await getOrCreatePartnerFeatureAccess(partnerId);
    const employeeFeatureAccess = await getOrCreateEmployeeFeatureAccess(
      employeeId,
      partnerId,
    );

    const effectiveAccess = getEffectiveFeatureAccess(
      getFeatureSlice(partnerFeatureAccess as Record<string, unknown>),
      getFeatureSlice(employeeFeatureAccess as Record<string, unknown>),
    );

    const formattedData = convertToJSONFormat(effectiveAccess);

    res.status(200).json({
      success: true,
      message: "Feature access retrieved successfully",
      data: formattedData,
    });
  } catch (error: any) {
    console.error("Get My Feature Access error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getEmployeeFeatureAccess = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const { employeeId } = req.params;

    const employee = await validateEmployee(employeeId, partnerId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const partnerFeatureAccess = await getOrCreatePartnerFeatureAccess(partnerId);
    const employeeFeatureAccess = await getOrCreateEmployeeFeatureAccess(
      employeeId,
      partnerId,
    );

    // Effective access = partner ∩ employee (if admin reduced partner access, employee loses it)
    const effectiveAccess = getEffectiveFeatureAccess(
      getFeatureSlice(partnerFeatureAccess as Record<string, unknown>),
      getFeatureSlice(employeeFeatureAccess as Record<string, unknown>),
    );

    const formattedData = convertToJSONFormat(effectiveAccess);

    res.status(200).json({
      success: true,
      message: "Employee feature access retrieved successfully",
      data: formattedData,
    });
  } catch (error: any) {
    console.error("Get Employee Feature Access error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const manageEmployeeFeatureAccess = async (
  req: Request,
  res: Response,
) => {
  try {
    const partnerId = req.user.id;
    const { employeeId } = req.params;
    const updates = req.body;

    const employee = await validateEmployee(employeeId, partnerId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    // Partner can only assign features they have (admin may have reduced partner access)
    const partnerFeatureAccess = await getOrCreatePartnerFeatureAccess(partnerId);

    const filteredUpdates: Record<string, boolean> = {};
    FEATURE_KEYS.forEach((key) => {
      if (updates[key] !== undefined) {
        const partnerHasAccess = partnerFeatureAccess[key] ?? false;
        filteredUpdates[key] = partnerHasAccess ? Boolean(updates[key]) : false;
      }
    });

    const existingAccess = await prisma.employee_feature_access.findFirst({
      where: {
        employeeId,
        partnerId,
      },
    });

    let employeeFeatureAccess;
    if (existingAccess) {
      employeeFeatureAccess = await prisma.employee_feature_access.update({
        where: { id: existingAccess.id },
        data: filteredUpdates,
      });
    } else {
      employeeFeatureAccess = await prisma.employee_feature_access.create({
        data: {
          employeeId,
          partnerId,
          ...defaultEmployeeFeatureAccessData,
          ...filteredUpdates,
        },
      });
    }

    // Return effective access (partner ∩ employee) so response reflects what employee actually has
    const effectiveAccess = getEffectiveFeatureAccess(
      getFeatureSlice(partnerFeatureAccess as Record<string, unknown>),
      getFeatureSlice(employeeFeatureAccess as Record<string, unknown>),
    );
    const formattedData = convertToJSONFormat(effectiveAccess);

    res.status(200).json({
      success: true,
      message: "Employee feature access updated successfully",
      data: formattedData,
    });
  } catch (error: any) {
    console.error("Manage Employee Feature Access error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};
