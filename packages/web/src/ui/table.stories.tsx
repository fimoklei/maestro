import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

const meta = {
  title: "Core/Table",
  component: Table,
  args: { children: null },
} satisfies Meta<typeof Table>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Description</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>skill</TableCell>
          <TableCell>tdd</TableCell>
          <TableCell>Test-driven development.</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>skill</TableCell>
          <TableCell>caveman</TableCell>
          <TableCell>Terse mode.</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};
