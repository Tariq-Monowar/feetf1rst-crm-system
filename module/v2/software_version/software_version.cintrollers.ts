import { prisma } from "../../../db";

export const createSoftwareVersion = async (req, res) => {
  try {
    const { version, releaseDate, title, description } = req.body;

    const requiredFields = ["version", "releaseDate", "description"];
    const missingFields = requiredFields.filter((f) => !req.body[f]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Required fields are missing",
        missingFields,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.software_version.updateMany({
        where: { isNewest: true },
        data: { isNewest: false },
      });

      return await tx.software_version.create({
        data: {
          version,
          releaseDate: new Date(releaseDate),
          title,
          description,
          isNewest: true,
        },
      });
    });

    res.status(201).json({
      success: true,
      message: "Software version created and set as newest",
      data: result,
    });
  } catch (error) {
    console.error("Error create version:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create software version",
      error: error.message,
    });
  }
};


export const getAllSoftwareVersions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await prisma.software_version.count();

    const versions = await prisma.software_version.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    const totalPages = total === 0 ? 1 : Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      message: total === 0 ? "No software versions found" : "Software versions fetched",
      data: versions,
      pagination: {
        totalItems: total,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage: page < totalPages && total > 0,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Error get versions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch software versions",
    });
  }
};


export const getSoftwareVersionById = async (req, res) => {
  try {
    const { id } = req.params;

    const version = await prisma.software_version.findUnique({
      where: { id },
    });

    if (!version) {
      return res.status(404).json({
        success: false,
        message: "Software version not found",
      });
    }

    res.status(200).json({
      success: true,
      data: version,
    });
  } catch (error) {
    console.error("Error get version:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch software version",
    });
  }
};

export const deleteSoftwareVersion = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.software_version.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Software version not found",
      });
    }

    await prisma.software_version.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: "Software version deleted successfully",
    });
  } catch (error) {
    console.error("Error delete version:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete software version",
    });
  }
};


export const updateSoftwareVersion = async (req, res) => {
  try {
    const { id } = req.params;
    const { version, releaseDate, title, description, isNewest } = req.body;

    const existing = await prisma.software_version.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Software version not found",
      });
    }

    const updateData: any = {};
    if (version !== undefined) updateData.version = version;
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (releaseDate !== undefined)
      updateData.releaseDate = new Date(releaseDate);

    if (isNewest === true) {
 
      const updated = await prisma.$transaction(async (tx) => {
        await tx.software_version.updateMany({
          where: { isNewest: true },
          data: { isNewest: false },
        });

        // Update this version
        updateData.isNewest = true;
        return await tx.software_version.update({
          where: { id },
          data: updateData,
        });
      });

      return res.status(200).json({
        success: true,
        message: "Software version updated successfully (set as newest)",
        data: updated,
      });
    }

    // Normal update if isNewest is not true
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields provided to update",
      });
    }

    const updated = await prisma.software_version.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json({
      success: true,
      message: "Software version updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Error update version:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update software version",
      error: error.message,
    });
  }
};


