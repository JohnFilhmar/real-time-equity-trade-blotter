import '@tanstack/react-table';

declare module '@tanstack/react-table' {
  // Column metadata the grid reads: responsive visibility classes and numeric alignment.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Tailwind classes applied to the header cell and every body cell, for responsive hiding. */
    class_name?: string;
    /** Right-align and tabular figures, for quantities and prices. */
    numeric?: boolean;
  }
}
