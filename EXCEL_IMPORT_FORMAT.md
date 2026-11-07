# Excel Import Format

Sirius imports student records from `.xlsx`, `.xls`, and `.csv` files. Put the column headings in the first row and put one student per row below them.

## Columns

| Column | Required | Description | Example |
| --- | --- | --- | --- |
| `student_account_no` | Yes | Student number from the school file; Sirius never generates it. Unique per school. | `JIPRA-2026-001` |
| `first_name` | Yes | Student's first name. | `Amina` |
| `last_name` | Yes | Student's last name. | `Njoroge` |
| `gender` | No | Student's gender. | `Female` |
| `class_name` | No | Student's class or grade. | `Form 2` |
| `stream` | No | Student's stream or section. | `East` |
| `photo_url` | No | URL for the student's photo. | `https://example.com/photos/amina.jpg` |
| `parent_name` | No | Parent or guardian name. | `Mary Njoroge` |
| `parent_phone` | No | Parent or guardian phone number. | `+254700000000` |

The required headings are `student_account_no`, `first_name`, and `last_name`. A row is skipped during import if any required value is missing.

## Example

| student_account_no | first_name | last_name | gender | class_name | stream | photo_url | parent_name | parent_phone |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| JIPRA-2026-001 | Amina | Njoroge | Female | Form 2 | East | https://example.com/photos/amina.jpg | Mary Njoroge | +254700000000 |
| JIPRA-2026-002 | Brian | Otieno | Male | Form 2 | West |  | Peter Otieno | +254711111111 |

## Heading aliases

The importer also recognizes these alternative headings:

| Standard column | Accepted alternatives |
| --- | --- |
| `student_account_no` | `admission_number`, `admission`, `Admission Number` |
| `first_name` | `firstName`, `First Name` |
| `last_name` | `lastName`, `Last Name` |
| `class_name` | `class`, `Class` |
| `photo_url` | `photo`, `Photo` |
| `parent_name` | `parent`, `Parent Name` |
| `parent_phone` | `parentPhone`, `Parent Phone` |
| `gender` | `Gender` |
| `stream` | `Stream` |

## Import rules

- Header names are case-sensitive as listed above, so use the standard `snake_case` headings for the most reliable result.
- Leading and trailing spaces in cell values are removed.
- Student account numbers must be unique within the file and school. Existing students with the same number are updated instead of duplicated.
- Blank optional cells are stored as empty values.
- The importer previews all rows first and imports only valid rows when confirmed.
- Sirius assigns its internal student identifier independently of the imported student account number.