"use client";
import { useTranslation } from "@/lib/store/i18nStore";
import { EmptyState } from "@/components/ui/empty-state";
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
        <EmptyState.Placeholder className="mx-0 w-full">
          <>
            {t("config.variablesEmptyPrefix")}{" "}
            <code className="inline-block bg-transparent px-0 py-0 font-mono text-[10px] leading-none align-middle text-blue-900">
              {"{{name}}"}
            </code>{" "}
            {t("config.variablesEmptySuffix")}
          </>
        </EmptyState.Placeholder>
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
