import OpenAI from "openai";
import { AppError } from "../../common/errors/app-error.js";
import type {
  VoucherSuggestionInput,
  VoucherSuggestionOutput,
} from "./ai-suggestion.types.js";

export interface VoucherSuggestionProvider {
  readonly model: string;
  suggest(input: VoucherSuggestionInput): Promise<VoucherSuggestionOutput>;
}

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "entries"],
  properties: {
    summary: { type: "string", minLength: 1, maxLength: 500 },
    entries: {
      type: "array",
      minItems: 2,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["direction", "accountCode", "rationale"],
        properties: {
          direction: { type: "string", enum: ["DEBIT", "CREDIT"] },
          accountCode: { type: "string" },
          rationale: { type: "string", minLength: 1, maxLength: 500 },
        },
      },
    },
  },
} as const;

const INSTRUCTIONS = `你是中国企业会计准则下的会计凭证科目建议助手。
只能从输入的 candidateAccounts 中选择科目编码，只输出凭证摘要、借贷方向、科目编码和理由。
严禁输出、计算、推断或调整任何金额；金额将由会计程序从原始单据确定。
必须至少建议一条借方和一条贷方。信息不足时选择最保守的科目，并在理由中说明。`;

export class OpenAiVoucherSuggestionProvider implements VoucherSuggestionProvider {
  private readonly client: OpenAI;

  constructor(
    public readonly model: string,
    apiKey: string,
    baseURL?: string,
  ) {
    this.client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  }

  async suggest(input: VoucherSuggestionInput): Promise<VoucherSuggestionOutput> {
    const response = await this.client.responses.create({
      model: this.model,
      instructions: INSTRUCTIONS,
      input: JSON.stringify(input),
      store: false,
      max_output_tokens: 1200,
      text: {
        format: {
          type: "json_schema",
          name: "voucher_account_suggestion",
          strict: true,
          schema: OUTPUT_SCHEMA,
        },
      },
    });
    if (!response.output_text) throw new AppError("AI_EMPTY_RESPONSE", "AI 未返回凭证建议", 502);
    try {
      return JSON.parse(response.output_text) as VoucherSuggestionOutput;
    } catch {
      throw new AppError("AI_INVALID_RESPONSE", "AI 返回内容不是有效 JSON", 502);
    }
  }
}

export class UnconfiguredVoucherSuggestionProvider implements VoucherSuggestionProvider {
  readonly model = "unconfigured";

  async suggest(): Promise<VoucherSuggestionOutput> {
    throw new AppError("AI_NOT_CONFIGURED", "尚未配置 OPENAI_API_KEY 和 AI_MODEL", 503);
  }
}
