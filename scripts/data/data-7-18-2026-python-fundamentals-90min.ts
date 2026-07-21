/**
 * 90-minute Python Fundamentals test (bilingual EN/VN).
 *
 * Scope: input/variables/types, if/elif/else, for/while, functions, basic lists.
 * NOT allowed for students: strings methods, files, exceptions, dicts/tuples,
 * comprehensions, and built-in shortcuts (sum/max/min/sorted/set).
 *
 * Structure:
 *   Part A — 20 concept MC (weight 2 each, auto-graded) → ~33% of grade
 *   Part B — 6 free-text coding challenges (weight 10/15/20) → ~67% of grade
 * Final grade = weighted average of per-question 0–100 scores.
 *
 * Seed (to the real DB from local):
 *   MONGODB_URI="<atlas uri from .env.local>" bun scripts/create-test.ts \
 *     scripts/data/data-7-18-2026-python-fundamentals-90min.ts
 *
 * The 90-minute time limit is applied by `create-test.ts` (via updateTestSettings)
 * from `test.timeLimitMinutes` below. Reveal flags are exam-safe: grade/answers
 * hidden until graded.
 */
export default {
  courseId: "c98f8f96-916d-48e0-a67b-a161c2cf422c",
  test: {
    title: "Python Fundamentals — 90-Minute Test",
    description:
      "90 minutes. Part A: 20 multiple-choice concept questions. Part B: 6 coding challenges (write full programs). Use only: input, print, if/elif/else, for, while, functions, and basic lists. Do NOT use built-in helpers like sum(), max(), min(), sorted(), or set() unless the problem says so.\n*90 phút. Phần A: 20 câu trắc nghiệm khái niệm. Phần B: 6 bài lập trình (viết chương trình hoàn chỉnh). Chỉ dùng: input, print, if/elif/else, for, while, hàm, và danh sách cơ bản. KHÔNG dùng các hàm có sẵn như sum(), max(), min(), sorted(), set() trừ khi đề cho phép.*",
    showCorrectAnswerAfterSubmit: false,
    showGradeAfterSubmit: false,
    timeLimitMinutes: 90,
  },
  questions: [
    // ==================== PART A — CONCEPT MC (weight 2 each) ====================

    // A1 — types
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
    // A2 — types
    {
      type: "single_select",
      title: "A2. Convert text to integer",
      content:
        'Which expression converts the text `"42"` into the integer 42?\n*Biểu thức nào chuyển chuỗi `"42"` thành số nguyên 42?*',
      options: [
        { text: 'int("42")', isCorrect: true },
        { text: "str(42)", isCorrect: false },
        { text: 'float("42")', isCorrect: false },
        { text: '"42" + 0', isCorrect: false },
      ],
      weight: 2,
    },
    // A3 — operator precedence
    {
      type: "single_select",
      title: "A3. Operator precedence",
      content:
        "What does `print(2 + 3 * 4)` output?\n*`print(2 + 3 * 4)` in ra gì?*",
      options: [
        { text: "14", isCorrect: true },
        { text: "20", isCorrect: false },
        { text: "24", isCorrect: false },
        { text: "9", isCorrect: false },
      ],
      weight: 2,
    },
    // A4 — string concatenation
    {
      type: "single_select",
      title: "A4. String concatenation",
      content:
        'What is the value of `"5" + "3"`?\n*Giá trị của `"5" + "3"` là gì?*',
      options: [
        { text: '"53"', isCorrect: true },
        { text: "8", isCorrect: false },
        { text: '"8"', isCorrect: false },
        { text: "53", isCorrect: false },
      ],
      weight: 2,
    },
    // A5 — modulo
    {
      type: "single_select",
      title: "A5. Modulo operator",
      content:
        "What is the value of `17 % 5`?\n*Giá trị của `17 % 5` là bao nhiêu?*",
      options: [
        { text: "2", isCorrect: true },
        { text: "3", isCorrect: false },
        { text: "3.4", isCorrect: false },
        { text: "1", isCorrect: false },
      ],
      weight: 2,
    },
    // A6 — floor division
    {
      type: "single_select",
      title: "A6. Floor division",
      content:
        "What is the value of `7 // 2`?\n*Giá trị của `7 // 2` là bao nhiêu?*",
      options: [
        { text: "3", isCorrect: true },
        { text: "3.5", isCorrect: false },
        { text: "4", isCorrect: false },
        { text: "1", isCorrect: false },
      ],
      weight: 2,
    },
    // A7 — exponent
    {
      type: "single_select",
      title: "A7. Exponent operator",
      content:
        "What is the value of `2 ** 3`?\n*Giá trị của `2 ** 3` là bao nhiêu?*",
      options: [
        { text: "8", isCorrect: true },
        { text: "6", isCorrect: false },
        { text: "9", isCorrect: false },
        { text: "5", isCorrect: false },
      ],
      weight: 2,
    },
    // A8 — booleans (multi-select, partial credit)
    {
      type: "multi_select",
      title: "A8. Which expressions are True?",
      content:
        "Select ALL expressions that evaluate to `True`.\n*Chọn TẤT CẢ biểu thức có giá trị `True`.*",
      options: [
        { text: "3 > 2", isCorrect: true },
        { text: '5 == "5"', isCorrect: false },
        { text: "not False", isCorrect: true },
        { text: "2 <= 2", isCorrect: true },
      ],
      mcGradingStrategy: "partial",
      weight: 2,
    },
    // A9 — boolean and
    {
      type: "single_select",
      title: "A9. Boolean and",
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
    // A10 — if/elif/else flow
    {
      type: "single_select",
      title: "A10. if / elif / elif / else",
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
    // A11 — choosing a loop
    {
      type: "single_select",
      title: "A11. Which loop for unknown count?",
      content:
        "Which loop is the best choice when you do NOT know in advance how many times to repeat?\n*Nên dùng vòng lặp nào khi bạn CHƯA biết trước số lần lặp?*",
      options: [
        { text: "while", isCorrect: true },
        { text: "for", isCorrect: false },
        { text: "if", isCorrect: false },
        { text: "range()", isCorrect: false },
      ],
      weight: 2,
    },
    // A12 — range
    {
      type: "single_select",
      title: "A12. range(1, 5)",
      content:
        "Which numbers does `range(1, 5)` produce?\n*`range(1, 5)` tạo ra những số nào?*",
      options: [
        { text: "1 2 3 4", isCorrect: true },
        { text: "1 2 3 4 5", isCorrect: false },
        { text: "0 1 2 3 4", isCorrect: false },
        { text: "2 3 4 5", isCorrect: false },
      ],
      weight: 2,
    },
    // A13 — break
    {
      type: "single_select",
      title: "A13. break",
      content:
        "What does `break` do inside a loop?\n*`break` làm gì bên trong một vòng lặp?*",
      options: [
        {
          text: "Exits the loop immediately / Thoát vòng lặp ngay lập tức",
          isCorrect: true,
        },
        {
          text: "Skips to the next iteration / Bỏ qua, sang lần lặp kế",
          isCorrect: false,
        },
        {
          text: "Restarts the loop from the start / Chạy lại vòng lặp từ đầu",
          isCorrect: false,
        },
        { text: "Does nothing / Không làm gì cả", isCorrect: false },
      ],
      weight: 2,
    },
    // A14 — continue
    {
      type: "single_select",
      title: "A14. continue",
      content:
        "What does `continue` do inside a loop?\n*`continue` làm gì bên trong một vòng lặp?*",
      options: [
        {
          text: "Skips the rest of this iteration and goes to the next / Bỏ phần còn lại của lần lặp này, sang lần kế",
          isCorrect: true,
        },
        {
          text: "Exits the loop immediately / Thoát vòng lặp ngay lập tức",
          isCorrect: false,
        },
        { text: "Ends the program / Kết thúc chương trình", isCorrect: false },
        {
          text: "Repeats the current line forever / Lặp lại dòng hiện tại mãi mãi",
          isCorrect: false,
        },
      ],
      weight: 2,
    },
    // A15 — function without return
    {
      type: "single_select",
      title: "A15. Function with no return",
      content:
        "A function only calls `print(...)` and has no `return`. What value does it give back to the caller?\n*Một hàm chỉ gọi `print(...)` và không có `return`. Nó trả về giá trị gì cho nơi gọi?*",
      options: [
        { text: "None", isCorrect: true },
        { text: "0", isCorrect: false },
        { text: '"" (empty string)', isCorrect: false },
        { text: "The printed text / Đoạn văn bản đã in", isCorrect: false },
      ],
      weight: 2,
    },
    // A16 — return keyword
    {
      type: "single_select",
      title: "A16. Sending a value back",
      content:
        "Which keyword sends a value back from a function to the caller?\n*Từ khóa nào gửi một giá trị từ hàm trở về nơi gọi?*",
      options: [
        { text: "return", isCorrect: true },
        { text: "print", isCorrect: false },
        { text: "def", isCorrect: false },
        { text: "input", isCorrect: false },
      ],
      weight: 2,
    },
    // A17 — parameters vs arguments
    {
      type: "single_select",
      title: "A17. def area(w, h)",
      content:
        "In `def area(w, h):`, what are `w` and `h` called?\n*Trong `def area(w, h):`, `w` và `h` được gọi là gì?*",
      options: [
        { text: "parameters / tham số", isCorrect: true },
        { text: "arguments / đối số (giá trị truyền vào)", isCorrect: false },
        { text: "return values / giá trị trả về", isCorrect: false },
        { text: "global variables / biến toàn cục", isCorrect: false },
      ],
      weight: 2,
    },
    // A18 — negative index
    {
      type: "single_select",
      title: "A18. Negative index",
      content:
        "For `nums = [10, 20, 30]`, what is `nums[-1]`?\n*Với `nums = [10, 20, 30]`, `nums[-1]` bằng bao nhiêu?*",
      options: [
        { text: "30", isCorrect: true },
        { text: "10", isCorrect: false },
        { text: "20", isCorrect: false },
        { text: "Error", isCorrect: false },
      ],
      weight: 2,
    },
    // A19 — appending to a list (multi-select, partial credit)
    {
      type: "multi_select",
      title: "A19. Add 5 to the end of a list",
      content:
        "Given `nums = [1, 2, 3]`, select ALL valid ways to add `5` to the END of the list.\n*Cho `nums = [1, 2, 3]`, chọn TẤT CẢ cách hợp lệ để thêm `5` vào CUỐI danh sách.*",
      options: [
        { text: "nums.append(5)", isCorrect: true },
        { text: "nums = nums + [5]", isCorrect: true },
        { text: "nums + 5", isCorrect: false },
        { text: "nums.add(5)", isCorrect: false },
      ],
      mcGradingStrategy: "partial",
      weight: 2,
    },
    // A20 — len()
    {
      type: "single_select",
      title: "A20. len()",
      content:
        "What is the value of `len([4, 5, 6])`?\n*Giá trị của `len([4, 5, 6])` là gì?*",
      options: [
        { text: "3", isCorrect: true },
        { text: "2", isCorrect: false },
        { text: "6", isCorrect: false },
        { text: "15", isCorrect: false },
      ],
      weight: 2,
    },

    // ==================== PART B — CODING CHALLENGES (free-text) ====================

    // --- EASY (weight 10) ---
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
      weight: 10,
    },
    {
      type: "free_text",
      title: "B2. Sum from 1 to N",
      content: `Read a positive integer N, then use a loop to compute and print the sum \`1 + 2 + ... + N\`. Do not use the built-in \`sum()\`.
*Đọc số nguyên dương N, sau đó dùng vòng lặp để tính và in tổng \`1 + 2 + ... + N\`. Không dùng hàm \`sum()\` có sẵn.*

**Example Input:**
\`\`\`
5
\`\`\`

**Example Output:**
\`\`\`
15
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "B3. is_positive(n)",
      content: `Write a function \`is_positive(n)\` that returns \`True\` if \`n\` is greater than 0, otherwise \`False\`. Read a number and print the result of calling the function.
*Viết hàm \`is_positive(n)\` trả về \`True\` nếu \`n\` lớn hơn 0, ngược lại \`False\`. Đọc một số và in kết quả gọi hàm.*

**Example Input:**
\`\`\`
-4
\`\`\`

**Example Output:**
\`\`\`
False
\`\`\``,
      weight: 10,
    },

    // --- MEDIUM (weight 15) ---
    {
      type: "free_text",
      title: "B4. Letter Grade",
      content: `Read a score from 0 to 100 and print its letter grade using \`if / elif / else\`:
A if score >= 90, B if >= 80, C if >= 70, D if >= 60, otherwise F.
*Đọc điểm số từ 0 đến 100 và in xếp loại chữ dùng \`if / elif / else\`:
A nếu >= 90, B nếu >= 80, C nếu >= 70, D nếu >= 60, còn lại F.*

**Example Input:**
\`\`\`
84
\`\`\`

**Example Output:**
\`\`\`
B
\`\`\``,
      weight: 15,
    },
    {
      type: "free_text",
      title: "B5. Largest in a List",
      content: `Read an integer N, then read N integers (separated by spaces) into a list. Find and print the largest value using a loop. Do not use the built-in \`max()\`.
*Đọc số nguyên N, sau đó đọc N số nguyên (cách nhau bởi dấu cách) vào một danh sách. Tìm và in giá trị lớn nhất bằng vòng lặp. Không dùng hàm \`max()\` có sẵn.*

**Example Input:**
\`\`\`
5
3 17 9 25 12
\`\`\`

**Example Output:**
\`\`\`
25
\`\`\``,
      weight: 15,
    },

    // --- HARD (weight 20) ---
    {
      type: "free_text",
      title: "B6. Prime Numbers up to N",
      content: `Write a function \`is_prime(n)\` that returns \`True\` if \`n\` is a prime number and \`False\` otherwise (a prime is greater than 1 and divisible only by 1 and itself). Then read an integer N and print every prime number from 2 to N (inclusive), separated by spaces on one line.
*Viết hàm \`is_prime(n)\` trả về \`True\` nếu \`n\` là số nguyên tố và \`False\` nếu không (số nguyên tố lớn hơn 1 và chỉ chia hết cho 1 và chính nó). Sau đó đọc số nguyên N và in tất cả số nguyên tố từ 2 đến N (bao gồm N), cách nhau bởi dấu cách trên một dòng.*

**Example Input:**
\`\`\`
20
\`\`\`

**Example Output:**
\`\`\`
2 3 5 7 11 13 17 19
\`\`\``,
      weight: 20,
    },
  ],
};
