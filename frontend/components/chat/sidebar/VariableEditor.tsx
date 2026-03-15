"use client";
import { useTranslation } from "@/lib/store/i18nStore";
import { Input } from "@/components/ui/input";

/* Variable Card */
function VarCard({
  varKey,
  value,
  valuePlaceholder,
  onChangeValue,
}: {
  varKey: string;
  value: string;
  valuePlaceholder: string;
  onChangeValue: (key: string, value: string) => void;
}) {
  return (
    <Input
      type="text"
      variant="affix"
      size="md"
      value={value}
      onChange={(e) => onChangeValue(varKey, e.target.value)}
      placeholder={valuePlaceholder}
      prefix={
        <span
          className="font-mono text-[13px] font-semibold text-ds-text truncate max-w-[75px]"
          title={varKey}
        >
          {varKey}
        </span>
      }
      className="w-full"
      inputClassName="font-mono text-xs"
    />
  );
}

/* Variable Editor */
export function VariableEditor({
  variables,
  onChange,
}: {
  variables: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
}) {
  const { t } = useTranslation();
  const keys = Object.keys(variables);
  return (
    <div className="flex flex-col gap-2">
      {keys.length === 0 ? (
        <div className="rounded-lg bg-gray-alpha-100 shadow-[0_0_0_1px_var(--ds-gray-alpha-200)] p-4 text-center flex flex-col gap-1">
          <p className="text-[13px] font-semibold text-ds-text-secondary">
            {t("config.variablesEmptyTitle")}
          </p>
          <p className="text-[11px] leading-relaxed text-ds-text-tertiary">
            {t("config.variablesEmptyPrefix")} <code className="bg-gray-alpha-200 px-1 rounded">{"{{name}}"}</code> {t("config.variablesEmptySuffix")}
          </p>
        </div>
      ) : (
        <div className="-mx-1 max-h-[320px] overflow-y-auto px-1 py-1">
          <div className="flex flex-col gap-3">
            {keys.map((key) => (
              <VarCard
                key={key}
                varKey={key}
                value={variables[key]}
                valuePlaceholder={t("config.variableValuePlaceholder")}
                onChangeValue={(k, val) => onChange({ ...variables, [k]: val })}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}