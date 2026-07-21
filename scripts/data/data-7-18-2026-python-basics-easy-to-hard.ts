/**
 * Python Basics practice exercise (bilingual EN/VN) — exercises ordered easy → hard.
 *
 * Scope: input/variables/types, arithmetic, comparison, boolean, and if/elif/else.
 * NOT allowed for students: loops, functions, lists, strings methods, files,
 * exceptions, and built-in shortcuts (max/min/abs) — solve with conditionals.
 *
 * Structure:
 *   Part A — 20 concept MC (weight 2 each, auto-graded)
 *   Part B — 9 branching-program coding challenges (free-text, weight 4/5/6 by band)
 * Untimed practice: no time limit; reveal flags are student-friendly (grade +
 * correct answers shown after submit) so students learn from their answers.
 *
 * Seed (to the real DB from local, uses Atlas URI from .env.local):
 *   bun scripts/create-test.ts scripts/data/data-7-18-2026-python-basics-easy-to-hard.ts
 */
export default {
  courseId: "c98f8f96-916d-48e0-a67b-a161c2cf422c",
  test: {
    title: "Python Basics — Input, Variables & Conditionals (Practice)",
    description:
      "Practice exercise, no time limit. Exercises go from easy to hard. Part A: 20 concept multiple-choice questions. Part B: 9 short programs. Use ONLY: input, print, variables, arithmetic, comparison, and, or, not, and if/elif/else. Do NOT use loops, functions, lists, or built-in helpers like max()/min().\n*Bài luyện tập, không giới hạn thời gian. Các bài đi từ dễ đến khó. Phần A: 20 câu trắc nghiệm khái niệm. Phần B: 9 chương trình ngắn. CHỈ dùng: input, print, biến, phép toán, so sánh, and, or, not, và if/elif/else. KHÔNG dùng vòng lặp, hàm, danh sách, hay các hàm có sẵn như max()/min().*",
    showCorrectAnswerAfterSubmit: true,
    showGradeAfterSubmit: true,
  },
  questions: [
    // ==================== PART A — CONCEPT MC (weight 2 each) ====================

    // --- Easy: types / arithmetic / basic comparison ---
    {
      type: "single_select",
      title: "A1. Return type of input()",
      content:
        "What data type does `input()` always return?\n*`input()` luôn trả về kiểu dữ liệu gì?*",
      options: [
        { text: "str", isCorrect: true },
        { text: "int", isCorrect: false },
        { text: "float", isCorrect: false },
        { text: "bool", isCorrect: false },
      ],
      weight: 2,
    },
    {
      type: "single_select",
      title: "A2. int() of a string",
      content:
        'What is the value of `int("7")`?\n*Giá trị của `int("7")` là gì?*',
      options: [
        { text: "7", isCorrect: true },
        { text: '"7"', isCorrect: false },
        { text: "7.0", isCorrect: false },
        { text: "Error", isCorrect: false },
      ],
      weight: 2,
    },
    {
      type: "single_select",
      title: "A3. float() of a string",
      content:
        'What is the value of `float("3.5")`?\n*Giá trị của `float("3.5")` là gì?*',
      options: [
        { text: "3.5", isCorrect: true },
        { text: '"3.5"', isCorrect: false },
        { text: "3", isCorrect: false },
        { text: "Error", isCorrect: false },
      ],
      weight: 2,
    },
    {
      type: "single_select",
      title: "A4. String concatenation",
      content:
        'What is the value of `"a" + "b"`?\n*Giá trị của `"a" + "b"` là gì?*',
      options: [
        { text: '"ab"', isCorrect: true },
        { text: '"a b"', isCorrect: false },
        { text: '"ba"', isCorrect: false },
        { text: "Error", isCorrect: false },
      ],
      weight: 2,
    },
    {
      type: "single_select",
      title: "A5. Operator precedence",
      content:
        "What does `print(10 + 2 * 3)` output?\n*`print(10 + 2 * 3)` in ra gì?*",
      options: [
        { text: "16", isCorrect: true },
        { text: "36", isCorrect: false },
        { text: "12", isCorrect: false },
        { text: "60", isCorrect: false },
      ],
      weight: 2,
    },
    {
      type: "single_select",
      title: "A6. Floor division",
      content:
        "What is the value of `10 // 3`?\n*Giá trị của `10 // 3` là gì?*",
      options: [
        { text: "3", isCorrect: true },
        { text: "3.33", isCorrect: false },
        { text: "4", isCorrect: false },
        { text: "1", isCorrect: false },
      ],
      weight: 2,
    },
    {
      type: "single_select",
      title: "A7. Modulo",
      content: "What is the value of `10 % 3`?\n*Giá trị của `10 % 3` là gì?*",
      options: [
        { text: "1", isCorrect: true },
        { text: "3", isCorrect: false },
        { text: "0", isCorrect: false },
        { text: "3.33", isCorrect: false },
      ],
      weight: 2,
    },
    {
      type: "single_select",
      title: "A8. Exponent",
      content: "What is the value of `2 ** 4`?\n*Giá trị của `2 ** 4` là gì?*",
      options: [
        { text: "16", isCorrect: true },
        { text: "8", isCorrect: false },
        { text: "6", isCorrect: false },
        { text: "24", isCorrect: false },
      ],
      weight: 2,
    },
    {
      type: "single_select",
      title: "A9. Comparison result",
      content: "What is the value of `7 > 3`?\n*Giá trị của `7 > 3` là gì?*",
      options: [
        { text: "True", isCorrect: true },
        { text: "False", isCorrect: false },
        { text: "7", isCorrect: false },
        { text: "Error", isCorrect: false },
      ],
      weight: 2,
    },
    {
      type: "single_select",
      title: "A10. Assignment vs comparison",
      content:
        "Which symbol ASSIGNS a value to a variable (not compares)?\n*Ký hiệu nào GÁN giá trị cho một biến (không phải so sánh)?*",
      options: [
        { text: "=", isCorrect: true },
        { text: "==", isCorrect: false },
        { text: "!=", isCorrect: false },
        { text: "=>", isCorrect: false },
      ],
      weight: 2,
    },

    // --- Medium: booleans / if-elif ---
    {
      type: "single_select",
      title: "A11. Boolean and",
      content:
        "What is the value of `True and False`?\n*Giá trị của `True and False` là gì?*",
      options: [
        { text: "False", isCorrect: true },
        { text: "True", isCorrect: false },
        { text: "None", isCorrect: false },
        { text: "Error", isCorrect: false },
      ],
      weight: 2,
    },
    {
      type: "single_select",
      title: "A12. not with comparison",
      content:
        "What is the value of `not (4 == 4)`?\n*Giá trị của `not (4 == 4)` là gì?*",
      options: [
        { text: "False", isCorrect: true },
        { text: "True", isCorrect: false },
        { text: "None", isCorrect: false },
        { text: "Error", isCorrect: false },
      ],
      weight: 2,
    },
    {
      type: "multi_select",
      title: "A13. Which expressions are True?",
      content:
        "Select ALL expressions that evaluate to `True`.\n*Chọn TẤT CẢ biểu thức có giá trị `True`.*",
      options: [
        { text: "3 >= 3", isCorrect: true },
        { text: "2 > 5", isCorrect: false },
        { text: "not False", isCorrect: true },
        { text: "(1 < 2) or (9 < 0)", isCorrect: true },
      ],
      mcGradingStrategy: "partial",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A14. if / elif / elif / else",
      content:
        "In an `if / elif / elif / else` chain, how many of its blocks run for one input?\n*Trong chuỗi `if / elif / elif / else`, có bao nhiêu khối được chạy cho một đầu vào?*",
      options: [
        { text: "Exactly one block / Đúng một khối", isCorrect: true },
        {
          text: "Every block whose condition is True / Mọi khối có điều kiện đúng",
          isCorrect: false,
        },
        {
          text: "All blocks in order / Tất cả các khối theo thứ tự",
          isCorrect: false,
        },
        { text: "None of them / Không khối nào", isCorrect: false },
      ],
      weight: 2,
    },
    {
      type: "single_select",
      title: "A15. Even test",
      content:
        "What is the value of `12 % 2 == 0`?\n*Giá trị của `12 % 2 == 0` là gì?*",
      options: [
        { text: "True", isCorrect: true },
        { text: "False", isCorrect: false },
        { text: "0", isCorrect: false },
        { text: "6", isCorrect: false },
      ],
      weight: 2,
    },
    {
      type: "single_select",
      title: "A16. Arithmetic before comparison",
      content:
        "What is the value of `5 + 3 > 6`?\n*Giá trị của `5 + 3 > 6` là gì?*",
      options: [
        { text: "True", isCorrect: true },
        { text: "False", isCorrect: false },
        { text: "8", isCorrect: false },
        { text: "Error", isCorrect: false },
      ],
      weight: 2,
    },
    {
      type: "single_select",
      title: "A17. Predict the output",
      content: `What does this program print?
*Chương trình này in ra gì?*
\`\`\`
x = 7
if x > 10:
    print("big")
elif x > 5:
    print("medium")
else:
    print("small")
\`\`\``,
      options: [
        { text: "medium", isCorrect: true },
        { text: "big", isCorrect: false },
        { text: "small", isCorrect: false },
        { text: "medium then small", isCorrect: false },
      ],
      weight: 2,
    },

    // --- Hard: tricky / edge ---
    {
      type: "single_select",
      title: "A18. int vs str equality",
      content:
        'What is the value of `5 == "5"`?\n*Giá trị của `5 == "5"` là gì?*',
      options: [
        { text: "False", isCorrect: true },
        { text: "True", isCorrect: false },
        { text: "Error", isCorrect: false },
        { text: "5", isCorrect: false },
      ],
      weight: 2,
    },
    {
      type: "single_select",
      title: "A19. Chained comparison",
      content:
        "For `x = 8`, what is the value of `0 < x < 10`?\n*Với `x = 8`, giá trị của `0 < x < 10` là gì?*",
      options: [
        { text: "True", isCorrect: true },
        { text: "False", isCorrect: false },
        { text: "8", isCorrect: false },
        { text: "Error", isCorrect: false },
      ],
      weight: 2,
    },
    {
      type: "multi_select",
      title: "A20. Truthiness of 0",
      content:
        'A program runs `x = 0`, then `if x:` with an indented `print("hi")`. Select ALL true statements.\n*Chương trình chạy `x = 0`, rồi `if x:` với dòng thụt lề `print("hi")`. Chọn TẤT CẢ câu đúng.*',
      options: [
        {
          text: 'The print("hi") is skipped / Dòng print("hi") bị bỏ qua',
          isCorrect: true,
        },
        {
          text: "0 is treated as False / 0 được xem là False",
          isCorrect: true,
        },
        { text: "0 is treated as True / 0 được xem là True", isCorrect: false },
        { text: "It causes an error / Nó gây ra lỗi", isCorrect: false },
      ],
      mcGradingStrategy: "partial",
      weight: 2,
    },

    // ==================== PART B — BRANCHING CODING (free-text) ====================

    // --- Easy (weight 4) ---
    {
      type: "free_text",
      title: "B1. Odd or Even",
      content: `Read an integer and print \`Even\` if it is even, or \`Odd\` if it is odd.
*Đọc một số nguyên và in \`Even\` nếu là số chẵn, hoặc \`Odd\` nếu là số lẻ.*

**Example Input:**
\`\`\`
7
\`\`\`

**Example Output:**
\`\`\`
Odd
\`\`\``,
      weight: 4,
    },
    {
      type: "free_text",
      title: "B2. Larger of Two",
      content: `Read two integers (each on its own line) and print the larger one. If they are equal, print that value.
*Đọc hai số nguyên (mỗi số một dòng) và in ra số lớn hơn. Nếu bằng nhau, in giá trị đó.*

**Example Input:**
\`\`\`
4
9
\`\`\`

**Example Output:**
\`\`\`
9
\`\`\``,
      weight: 4,
    },
    {
      type: "free_text",
      title: "B3. Sign of a Number",
      content: `Read an integer and print \`Positive\` if it is greater than 0, \`Negative\` if it is less than 0, or \`Zero\` if it is 0. Use \`if/elif/else\`.
*Đọc một số nguyên và in \`Positive\` nếu lớn hơn 0, \`Negative\` nếu nhỏ hơn 0, hoặc \`Zero\` nếu bằng 0. Dùng \`if/elif/else\`.*

**Example Input:**
\`\`\`
-3
\`\`\`

**Example Output:**
\`\`\`
Negative
\`\`\``,
      weight: 4,
    },

    // --- Medium (weight 5) ---
    {
      type: "free_text",
      title: "B4. Letter Grade",
      content: `Read a score from 0 to 100 and print its letter grade using \`if/elif/else\`: A if >= 90, B if >= 80, C if >= 70, D if >= 60, otherwise F.
*Đọc điểm số từ 0 đến 100 và in xếp loại chữ dùng \`if/elif/else\`: A nếu >= 90, B nếu >= 80, C nếu >= 70, D nếu >= 60, còn lại F.*

**Example Input:**
\`\`\`
84
\`\`\`

**Example Output:**
\`\`\`
B
\`\`\``,
      weight: 5,
    },
    {
      type: "free_text",
      title: "B5. Ticket Price by Age",
      content: `Read a person's age (an integer) and print the ticket price: \`5\` for a child (age under 12), \`7\` for a senior (age 65 or older), otherwise \`10\`.
*Đọc tuổi (số nguyên) và in giá vé: \`5\` cho trẻ em (dưới 12 tuổi), \`7\` cho người cao tuổi (từ 65 tuổi trở lên), còn lại \`10\`.*

**Example Input:**
\`\`\`
70
\`\`\`

**Example Output:**
\`\`\`
7
\`\`\``,
      weight: 5,
    },
    {
      type: "free_text",
      title: "B6. Leap Year",
      content: `Read a year (an integer) and print \`Leap\` if it is a leap year, otherwise \`Not leap\`. A year is a leap year if it is divisible by 4 AND (not divisible by 100 OR divisible by 400).
*Đọc một năm (số nguyên) và in \`Leap\` nếu là năm nhuận, ngược lại \`Not leap\`. Một năm là năm nhuận nếu chia hết cho 4 VÀ (không chia hết cho 100 HOẶC chia hết cho 400).*

**Example Input:**
\`\`\`
2000
\`\`\`

**Example Output:**
\`\`\`
Leap
\`\`\``,
      weight: 5,
    },

    // --- Hard (weight 6) ---
    {
      type: "free_text",
      title: "B7. Largest of Three",
      content: `Read three integers (each on its own line) and print the largest. Do NOT use the built-in \`max()\` — use \`if/elif/else\`.
*Đọc ba số nguyên (mỗi số một dòng) và in số lớn nhất. KHÔNG dùng hàm \`max()\` có sẵn — dùng \`if/elif/else\`.*

**Example Input:**
\`\`\`
3
9
5
\`\`\`

**Example Output:**
\`\`\`
9
\`\`\``,
      weight: 6,
    },
    {
      type: "free_text",
      title: "B8. Triangle Type",
      content: `Read three side lengths a, b, c (each on its own line). If they cannot form a triangle (the sum of some two sides is not greater than the third), print \`Not a triangle\`. Otherwise print \`Equilateral\` (all three equal), \`Isosceles\` (exactly two equal), or \`Scalene\` (all different).
*Đọc ba độ dài cạnh a, b, c (mỗi số một dòng). Nếu không tạo thành tam giác (tổng của hai cạnh nào đó không lớn hơn cạnh còn lại), in \`Not a triangle\`. Ngược lại in \`Equilateral\` (ba cạnh bằng nhau), \`Isosceles\` (đúng hai cạnh bằng nhau), hoặc \`Scalene\` (ba cạnh khác nhau).*

**Example Input:**
\`\`\`
3
3
5
\`\`\`

**Example Output:**
\`\`\`
Isosceles
\`\`\``,
      weight: 6,
    },
    {
      type: "free_text",
      title: "B9. Point Quadrant",
      content: `Read two integers x and y (each on its own line): the coordinates of a point. Print \`1\`, \`2\`, \`3\`, or \`4\` for its quadrant, or \`On an axis\` if the point lies on the x-axis or y-axis.
Quadrants: 1 = (x>0, y>0), 2 = (x<0, y>0), 3 = (x<0, y<0), 4 = (x>0, y<0).
*Đọc hai số nguyên x và y (mỗi số một dòng): tọa độ của một điểm. In \`1\`, \`2\`, \`3\`, hoặc \`4\` cho góc phần tư, hoặc \`On an axis\` nếu điểm nằm trên trục x hoặc trục y.
Góc phần tư: 1 = (x>0, y>0), 2 = (x<0, y>0), 3 = (x<0, y<0), 4 = (x>0, y<0).*

**Example Input:**
\`\`\`
-2
5
\`\`\`

**Example Output:**
\`\`\`
2
\`\`\``,
      weight: 6,
    },
  ],
};
