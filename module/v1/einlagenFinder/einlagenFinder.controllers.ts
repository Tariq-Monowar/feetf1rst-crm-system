import { Request, Response } from "express";
import { prisma } from "../../../db";
import fs from "fs";
import path from "path";

/**
 * EinlagenFinder API
 *
 * POST /api/v1/einlagen-finder
 * Expected request body:
 * {
 *   "category": "BUSINESSEINLAGE",
 *   "userId": "customer-uuid-here", // or customerId
 *   "answers": [
 *     { "questionId": 1, "selected": "Sneaker" },
 *     { "questionId": 3, "selected": "Wenig aktiv" },
 *     { "questionId": 4, "selected": "Nein" },
 *     { "questionId": 6, "selected": [
 *       { "questionId": 1, "selected": "Seit mehreren Wochen" },
 *       { "questionId": 2, "selected": "Ich kann keine längeren Strecken mehr gehen" },
 *       { "questionId": 3, "selected": "Ziehend" },
 *       { "questionId": 4, "selected": "Beim Barfußgehen" }
 *     ]},
 *     { "questionId": 7, "selected": "Ja, Rückenschmerzen" },
 *     { "questionId": 8, "selected": "Ja, bitte angeben" },
 *     { "questionId": 9, "selected": "Schwarz" }
 *   ]
 * }
 *
 * GET /api/v1/einlagen-finder/:customerId?category=BUSINESSEINLAGE
 */

export const setEinlagenFinder = async (req: Request, res: Response) => {
  try {
    const { customerId, category, answers } = req.body;
    console.log(answers);
    console.log(customerId);
    console.log(category);
    console.log(req.body);

    const missingField = ["category", "answers"].find(
      (field) => !req.body[field]
    );

    if (missingField) {
      return res.status(400).json({
        success: false,
        message: `${missingField} is required!`,
      });
    }

    const validCategories = [
      "BUSINESSEINLAGE",
      "ALLTAGSEINLAGE",
      "SPORTEINLAGE",
    ];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid category. Must be one of: " + validCategories.join(", "),
      });
    }

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Answers must be a non-empty array",
      });
    }

    const customerExists = await prisma.customers.findUnique({
      where: { id: customerId },
    });

    if (!customerExists) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const savedAnswers = [];

    for (const answer of answers) {
      const { questionId, selected } = answer;

      if (!questionId || selected === undefined) {
        continue;
      }

      try {
        let answerData = selected;

        if (Array.isArray(selected)) {
          answerData = selected;
        }

        const savedAnswer = await prisma.einlagenAnswers.upsert({
          where: {
            customerId_questionId: {
              customerId: customerId,
              questionId: questionId.toString(),
            },
          },
          update: {
            answer: answerData,
            category: category,
          },
          create: {
            customerId: customerId,
            category: category,
            questionId: questionId.toString(),
            answer: answerData,
          },
        });

        savedAnswers.push(savedAnswer);
      } catch (answerError) {
        console.error(
          `Error saving answer for question ${questionId}:`,
          answerError
        );
      }
    }

    console.log(savedAnswers);
    return res.status(201).json({
      success: true,
      message: "Answers stored successfully!",
      data: {
        customerId,
        category,
        savedAnswers: savedAnswers.map((answer) => ({
          questionId: answer.questionId,
          answer: answer.answer,
        })),
      },
    });
  } catch (error) {
    console.error("Error in setEinlagenFinder:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getEinlagenFinderAnswers = async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    const { category } = req.query;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "Customer ID is required",
      });
    }

    // Check if customer exists
    const customerExists = await prisma.customers.findUnique({
      where: { id: customerId },
    });

    if (!customerExists) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Build where clause
    const whereClause: any = {
      customerId: customerId,
    };

    if (category) {
      const validCategories = [
        "BUSINESSEINLAGE",
        "ALLTAGSEINLAGE",
        "SPORTEINLAGE",
      ];
      if (!validCategories.includes(category as string)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid category. Must be one of: " + validCategories.join(", "),
        });
      }
      whereClause.category = category;
    }

    // Fetch answers
    const answers = await prisma.einlagenAnswers.findMany({
      where: whereClause,
      orderBy: [{ category: "asc" }, { questionId: "asc" }],
    });

    // Group answers by category
    const groupedAnswers = answers.reduce((acc, answer) => {
      if (!acc[answer.category]) {
        acc[answer.category] = [];
      }
      acc[answer.category].push({
        id: answer.id,
        questionId: answer.questionId,
        answer: answer.answer,
      });
      return acc;
    }, {} as Record<string, any[]>);

    return res.status(200).json({
      success: true,
      message: "Answers retrieved successfully",
      data: {
        customerId,
        customer: {
          id: customerExists.id,
          vorname: customerExists.vorname,
          nachname: customerExists.nachname,
          email: customerExists.email,
        },
        totalAnswers: answers.length,
        answersByCategory: groupedAnswers,
        allAnswers: answers.map((answer) => ({
          id: answer.id,
          category: answer.category,
          questionId: answer.questionId,
          answer: answer.answer,
        })),
      },
    });
  } catch (error) {
    console.error("Error in getEinlagenFinderAnswers:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getEinlagenFinderQuestions = async (
  req: Request,
  res: Response
) => {
  try {
    const jsonPath = path.join(__dirname, "einlagenFinder.json");

    if (!fs.existsSync(jsonPath)) {
      return res.status(404).json({
        success: false,
        message: "Questions data not found",
      });
    }

    const jsonData = fs.readFileSync(jsonPath, "utf8");
    const questions = JSON.parse(jsonData);

    return res.status(200).json({
      success: true,
      message: "Questions retrieved successfully",
      data: questions,
    });
  } catch (error) {
    console.error("Error in getEinlagenFinderQuestions:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getAnswersByUserId = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const customer = await prisma.customers.findUnique({
      where: { id: userId },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found for the given user ID",
      });
    }

    const answers = await prisma.einlagenAnswers.findMany({
      where: { customerId: customer.id },
      orderBy: [{ category: "asc" }, { questionId: "asc" }],
    });

    const groupedAnswers = answers.reduce((acc, answer) => {
      if (!acc[answer.category]) acc[answer.category] = [];
      acc[answer.category].push({
        questionId: answer.questionId,
        answer: answer.answer,
      });
      return acc;
    }, {} as Record<string, any[]>);

    return res.status(200).json({
      success: true,
      message: "Answers get successfully",
      data: {
        customerId: customer.id,
        totalAnswers: answers.length,
        answer: groupedAnswers,
      },
    });
  } catch (error) {
    console.error("Error in getAnswersByUserId:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};
