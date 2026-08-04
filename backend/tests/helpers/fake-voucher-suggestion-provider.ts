import type {
  VoucherSuggestionInput,
  VoucherSuggestionOutput,
} from "../../src/modules/ai-suggestion/ai-suggestion.types.js";
import type { VoucherSuggestionProvider } from "../../src/modules/ai-suggestion/voucher-suggestion.provider.js";

export class FakeVoucherSuggestionProvider implements VoucherSuggestionProvider {
  readonly model = "fake-accounting-model";
  inputs: VoucherSuggestionInput[] = [];

  constructor(public output: VoucherSuggestionOutput) {}

  async suggest(input: VoucherSuggestionInput) {
    this.inputs.push(input);
    return this.output;
  }
}
