import { Request, Response } from "express";
import { prisma } from "../../../db";
import {
  questionnaireData,
  InsolesQuestionnaData,
  shoeQuestionnaData,
} from "./question.data";

// function normalize(text) {
//   return text.toLowerCase().replace(/[^\w\s]/gi, "").replace(/\s+/g, "_").trim();
// }

// export const getQuestionsFlow = (req, res) => {
//   const { categoryTitle, subCategoryTitle } = req.params;

//   if (!categoryTitle) {
//     const categories = questionnaireData.map(cat => ({
//       title: cat.title,
//       slug: normalize(cat.title),
//       image: cat.image
//     }));
//     return res.json({ level: "category", data: categories });
//   }

//   const category = questionnaireData.find(
//     c => normalize(c.title) === normalize(categoryTitle)
//   );

//   if (!category) {
//     return res.status(404).json({ message: "Category not found" });
//   }

//   if (Array.isArray(category.data) && category.data.length > 0) {
//     if (subCategoryTitle) {
//       const subCategory = category.data.find(
//         sub => normalize(sub.title) === normalize(subCategoryTitle)
//       );

//       if (!subCategory) {
//         return res.status(404).json({ message: "Sub-category not found" });
//       }

//       return res.json({
//         level: "questions",
//         category: category.title,
//         subCategory: subCategory.title,
//         questions: (subCategory.questions || []).map(q => ({
//           question: q.question,
//           question_key: normalize(q.question),
//           options: q.options
//         }))
//       });
//     }

//     const subCategories = category.data.map(sub => ({
//       title: sub.title,
//       slug: normalize(sub.title),
//       image: sub.image
//     }));

//     return res.json({
//       level: "sub-categories",
//       category: category.title,
//       data: subCategories
//     });
//   }

//   if (category.questions && Array.isArray(category.questions)) {
//     return res.json({
//       level: "questions",
//       category: category.title,
//       questions: category.questions.map(q => ({
//         question: q.question,
//         question_key: normalize(q.question),
//         options: q.options
//       }))
//     });
//   }

//   return res.json({ level: "category", category: category.title, data: [] });
// };

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/gi, "")
    .replace(/\s+/g, "_")
    .trim();
}

export const getQuestionsFlow = (req, res) => {
  const { categoryTitle, subCategoryTitle } = req.params;

  // ✅ 1. If no category provided → return all categories
  if (!categoryTitle) {
    const categories = questionnaireData.map((cat) => ({
      title: cat.title,
      slug: normalize(cat.title),
      image: cat.image,
    }));

    return res.json({ level: "category", data: categories });
  }

  // ✅ 2. Find category
  const category = questionnaireData.find(
    (c) => normalize(c.title) === normalize(categoryTitle)
  );

  if (!category) {
    return res.status(404).json({ message: "Category not found" });
  }

  // ✅ 3. If category has subcategories
  if (Array.isArray(category.data) && category.data.length > 0) {
    // If subcategory provided → return questions
    if (subCategoryTitle) {
      const subCategory = category.data.find(
        (sub) => normalize(sub.title) === normalize(subCategoryTitle)
      );

      if (!subCategory) {
        return res.status(404).json({ message: "Sub-category not found" });
      }

      return res.json({
        level: "questions",
        category: category.title,
        subCategory: subCategory.title,
        questions: (subCategory.questions || []).map((q) => ({
          question: q.question,
          question_key: normalize(q.question),
          options: q.options,
        })),
      });
    }

    // Otherwise → return subcategories
    const subCategories = category.data.map((sub) => ({
      title: sub.title,
      slug: normalize(sub.title),
      image: sub.image,
    }));

    return res.json({
      level: "sub-categories",
      category: category.title,
      data: subCategories,
    });
  }

  // ✅ 4. If category has direct questions (no subcategories)
  if (category.questions && Array.isArray(category.questions)) {
    return res.json({
      level: "questions",
      category: category.title,
      questions: category.questions.map((q) => ({
        question: q.question,
        question_key: normalize(q.question),
        options: q.options,
      })),
    });
  }

  // ✅ 5. Default fallback
  return res.json({
    level: "category",
    category: category.title,
    data: [],
  });
};

// Helper function to mark options as current based on saved answers
const markCurrentOptions = (questions: any[], savedAnswers: any) => {
  return questions.map((questionData) => {
    const questionId = questionData.id;
    const answerData = savedAnswers[questionId];

    // Handle question 4 which has nested sub-questions in options
    // Only apply this special logic when the data actually contains sub-questions.
    // (In soles questionnaire id=4 is nested, in shoes questionnaire id=4 is flat.)
    const hasNestedSubQuestions =
      questionId === 4 &&
      Array.isArray(questionData.questions) &&
      questionData.questions.some(
        (q: any) =>
          Array.isArray(q.options) &&
          q.options.some(
            (opt: any) =>
              opt &&
              typeof opt === "object" &&
              !Array.isArray(opt) &&
              "question" in opt
          )
      );

    if (hasNestedSubQuestions) {
      return {
        ...questionData,
        questions: questionData.questions.map((mainQ: any) => {
          // For question 4, the options array contains sub-questions
          if (mainQ.options && mainQ.options.some((opt: any) => opt.question)) {
            return {
              ...mainQ,
              options: mainQ.options
                .filter(
                  (opt: any) =>
                    opt && typeof opt === "object" && !Array.isArray(opt)
                )
                .map((subQOption: any) => {
                  // This option is actually a sub-question
                  if (subQOption.question && subQOption.options) {
                    const subAnswer = answerData?.[subQOption.id];

                    if (!subAnswer) {
                      return {
                        ...subQOption,
                        options: subQOption.options
                          .filter(
                            (opt: any) =>
                              opt &&
                              typeof opt === "object" &&
                              !Array.isArray(opt)
                          )
                          .map((opt: any) => ({
                            ...opt,
                            current: false,
                          })),
                      };
                    }

                    const selectedIds = Array.isArray(subAnswer.id)
                      ? subAnswer.id
                      : [subAnswer.id];
                    const ownText = subAnswer.ownText || {};

                    return {
                      ...subQOption,
                      options: subQOption.options
                        .filter(
                          (opt: any) =>
                            opt &&
                            typeof opt === "object" &&
                            !Array.isArray(opt)
                        )
                        .map((opt: any) => {
                          const isSelected = selectedIds.includes(opt.id);
                          const customText =
                            ownText[opt.id] || opt.ownText || "";

                          return {
                            ...opt,
                            current: isSelected,
                            ownText: customText,
                          };
                        }),
                    };
                  }
                  // Regular option (not a sub-question) - shouldn't happen for question 4
                  return {
                    ...subQOption,
                    current: false,
                  };
                }),
            };
          }
          // Regular question structure (fallback)
          return {
            ...mainQ,
            options:
              mainQ.options
                ?.filter(
                  (opt: any) =>
                    opt && typeof opt === "object" && !Array.isArray(opt)
                )
                ?.map((opt: any) => ({
                  ...opt,
                  current: false,
                })) || [],
          };
        }),
      };
    }

    // Handle regular questions (single or multiple selection)
    if (!answerData) {
      return {
        ...questionData,
        questions: questionData.questions.map((q: any) => ({
          ...q,
          options: q.options
            .filter(
              (opt: any) =>
                opt && typeof opt === "object" && !Array.isArray(opt)
            )
            .map((opt: any) => ({
              ...opt,
              current: false,
            })),
        })),
      };
    }

    return {
      ...questionData,
      questions: questionData.questions.map((q: any) => {
        const selectedIds = Array.isArray(answerData.id)
          ? answerData.id
          : [answerData.id];
        const ownText = answerData.ownText || {};

        return {
          ...q,
          options: q.options
            .filter(
              (opt: any) =>
                opt && typeof opt === "object" && !Array.isArray(opt)
            )
            .map((opt: any) => {
              const isSelected = selectedIds.includes(opt.id);
              const customText = ownText[opt.id] || opt.ownText || "";

              return {
                ...opt,
                current: isSelected,
                ownText: customText,
              };
            }),
        };
      }),
    };
  });
};

// Get insoles questions with current answers marked
export const getInsolesQuestions = async (req: Request, res: Response) => {
  console.log("getInsolesQuestions");
  try {
    const { customerId } = req.params;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "Customer ID is required",
      });
    }

    // Verify customer exists
    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Determine partner (creator of the customer)
    const partnerId = customer.partnerId;

    // Get control configuration for this partner (if any)
    const controlConfig = await prisma.controllQuestions.findUnique({
      where: { partnerId },
    });

    // Get saved answers if they exist
    const savedAnswer = await prisma.insolesAnswers.findFirst({
      where: { customerId },
    });

    const savedAnswers = savedAnswer?.answer || {};

    // Decide which question blocks to show based on control configuration
    const controlIds = controlConfig?.controlInsolesQuestions || [];

    // If no IDs are configured, return no questions
    const sourceQuestions =
      Array.isArray(controlIds) && controlIds.length > 0
        ? InsolesQuestionnaData.filter((q) => controlIds.includes(q.id))
        : [];

    // Mark current options based on saved answers
    const questionsWithCurrent = markCurrentOptions(
      sourceQuestions,
      savedAnswers
    );

    return res.json({
      success: true,
      data: questionsWithCurrent,
    });
  } catch (error: any) {
    console.error("Error getting insoles questions:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Set/Update insoles answers
export const setInsolesAnswers = async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    const { answer } = req.body;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "Customer ID is required",
      });
    }

    if (!answer || typeof answer !== "object") {
      return res.status(400).json({
        success: false,
        message: "Answer data is required and must be an object",
      });
    }

    // Verify customer exists
    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Find existing answer (get the first one if multiple exist)
    const existingAnswer = await prisma.insolesAnswers.findFirst({
      where: { customerId },
      orderBy: { id: "desc" }, // Get the most recent one
    });

    let insolesAnswer;

    if (existingAnswer) {
      // Update existing answer
      insolesAnswer = await prisma.insolesAnswers.update({
        where: { id: existingAnswer.id },
        data: { answer: answer },
      });
    } else {
      // Create new answer
      insolesAnswer = await prisma.insolesAnswers.create({
        data: {
          customerId: customerId,
          answer: answer,
        },
      });
    }

    return res.json({
      success: true,
      message: "Answers saved successfully",
      data: insolesAnswer,
    });
  } catch (error: any) {
    console.error("Error setting insoles answers:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

export const getShoesQuestions = async (req: Request, res: Response) => {
  console.log("getShoesQuestions");
  try {
    const { customerId } = req.params;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "Customer ID is required",
      });
    }

    // Verify customer exists
    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Determine partner (creator of the customer)
    const partnerId = customer.partnerId;

    // Get control configuration for this partner (if any)
    const controlConfig = await prisma.controllQuestions.findUnique({
      where: { partnerId },
    });

    // Get saved answers if they exist
    const savedAnswer = await prisma.shoeAnswers.findFirst({
      where: { customerId },
    });

    const savedAnswers = savedAnswer?.answer || {};

    // Decide which question blocks to show based on control configuration
    const controlIds = controlConfig?.controlShoeQuestions || [];

    // If no IDs are configured, return no questions
    const sourceQuestions =
      Array.isArray(controlIds) && controlIds.length > 0
        ? shoeQuestionnaData.filter((q) => controlIds.includes(q.id))
        : [];

    // Mark current options based on saved answers
    const questionsWithCurrent = markCurrentOptions(
      sourceQuestions,
      savedAnswers
    );

    return res.json({
      success: true,
      data: questionsWithCurrent,
    });
  } catch (error: any) {
    console.error("Error getting shoes questions:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Set/Update insoles answers
export const setShoesAnswers = async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    const { answer } = req.body;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "Customer ID is required",
      });
    }

    if (!answer || typeof answer !== "object") {
      return res.status(400).json({
        success: false,
        message: "Answer data is required and must be an object",
      });
    }

    // Verify customer exists
    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Find existing answer (get the first one if multiple exist)
    const existingAnswer = await prisma.shoeAnswers.findFirst({
      where: { customerId },
      orderBy: { id: "desc" }, // Get the most recent one
    });

    let shoesAnswer;

    if (existingAnswer) {
      // Update existing answer
      shoesAnswer = await prisma.shoeAnswers.update({
        where: { id: existingAnswer.id },
        data: { answer: answer },
      });
    } else {
      // Create new answer
      shoesAnswer = await prisma.shoeAnswers.create({
        data: {
          customerId: customerId,
          answer: answer,
        },
      });
    }

    return res.json({
      success: true,
      message: "Answers saved successfully",
      data: shoesAnswer,
    });
  } catch (error: any) {
    console.error("Error setting shoes answers:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

export const getControllQuestions = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const { controlShoeQuestions, controlInsolesQuestions } = req.body;

    const partner = await prisma.user.findUnique({
      where: { id: partnerId },
    });

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      });
    }

    const controllQuestions = await prisma.controllQuestions.upsert({
      where: { partnerId: partnerId },
      create: {
        partnerId: partnerId,
        controlShoeQuestions: controlShoeQuestions,
        controlInsolesQuestions: controlInsolesQuestions,
      },
      update: {
        controlShoeQuestions: controlShoeQuestions,
        controlInsolesQuestions: controlInsolesQuestions,
      },
    });

    return res.status(200).json({
      success: true,
      data: controllQuestions,
    });
  } catch (error: any) {
    console.error("Error getting controll questions:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

export const getQuestions = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;

    const controlConfig = await prisma.controllQuestions.findUnique({
      where: { partnerId },
    });

    const activeInsolesIds = controlConfig?.controlInsolesQuestions || [];
    const activeShoesIds = controlConfig?.controlShoeQuestions || [];

    const insoles = InsolesQuestionnaData.map((block) => ({
      id: block.id,
      question: block.questions?.[0]?.question ?? "",
      active:
        Array.isArray(activeInsolesIds) &&
        activeInsolesIds.includes(block.id),
    }));


    const shoes = shoeQuestionnaData.map((block) => ({
      id: block.id,

      question: block.questions?.[0]?.question ?? "",
      active:
        Array.isArray(activeShoesIds) && activeShoesIds.includes(block.id),
    }));

    return res.status(200).json({
      success: true,
      data: {
        insoles,
        shoes,
      },
    });
  } catch (error: any) {
    console.error("Error getting questions:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};
