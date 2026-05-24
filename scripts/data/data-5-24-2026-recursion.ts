export default {
  courseId: "c98f8f96-916d-48e0-a67b-a161c2cf422c",
  test: {
    title: "Python Practice: Recursion Basics",
    description:
      "Complete these 10 basic recursion exercises. Each problem should be solved using a recursive function (a function that calls itself). Avoid using loops (for/while) — the goal is to practice writing the base case and the recursive case correctly.",
    showCorrectAnswerAfterSubmit: true,
    showGradeAfterSubmit: true,
  },
  questions: [
    {
      type: "free_text",
      title: "Factorial",
      content: `Write a recursive function \`factorial(n)\` that returns n! (the factorial of n). Read a non-negative integer N from input and print factorial(N). Recall: 0! = 1 and n! = n * (n-1)!.
*Viết hàm đệ quy \`factorial(n)\` trả về n! (giai thừa của n). Đọc một số nguyên không âm N từ input và in factorial(N). Nhắc lại: 0! = 1 và n! = n * (n-1)!.*

**Example Input:**
\`\`\`
5
\`\`\`

**Example Output:**
\`\`\`
120
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Sum from 1 to N",
      content: `Write a recursive function \`sum_to(n)\` that returns 1 + 2 + 3 + ... + n. Read N from input and print the result. Do not use loops or the built-in sum().
*Viết hàm đệ quy \`sum_to(n)\` trả về 1 + 2 + 3 + ... + n. Đọc N từ input và in kết quả. Không dùng vòng lặp hay hàm sum() có sẵn.*

**Example Input:**
\`\`\`
6
\`\`\`

**Example Output:**
\`\`\`
21
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Sum of Digits",
      content: `Write a recursive function \`sum_digits(n)\` that returns the sum of the digits of a non-negative integer n. For example, sum_digits(1234) = 1 + 2 + 3 + 4 = 10. Read N from input and print the result.
*Viết hàm đệ quy \`sum_digits(n)\` trả về tổng các chữ số của số nguyên không âm n. Ví dụ: sum_digits(1234) = 1 + 2 + 3 + 4 = 10. Đọc N từ input và in kết quả.*

**Example Input:**
\`\`\`
2059
\`\`\`

**Example Output:**
\`\`\`
16
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Count Digits",
      content: `Write a recursive function \`count_digits(n)\` that returns how many digits the non-negative integer n has. For example, count_digits(7) = 1 and count_digits(2059) = 4. Read N and print the result.
*Viết hàm đệ quy \`count_digits(n)\` trả về số lượng chữ số của số nguyên không âm n. Ví dụ: count_digits(7) = 1 và count_digits(2059) = 4. Đọc N và in kết quả.*

**Example Input:**
\`\`\`
80021
\`\`\`

**Example Output:**
\`\`\`
5
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Power",
      content: `Write a recursive function \`power(a, b)\` that returns a raised to the power b (a^b) for non-negative integer b. Do not use the ** operator or pow(). Read a and b from input (on two separate lines) and print power(a, b).
*Viết hàm đệ quy \`power(a, b)\` trả về a mũ b (a^b) với b là số nguyên không âm. Không dùng toán tử ** hay hàm pow(). Đọc a và b từ input (trên hai dòng riêng biệt) và in power(a, b).*

**Example Input:**
\`\`\`
2
10
\`\`\`

**Example Output:**
\`\`\`
1024
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Nth Fibonacci",
      content: `Write a recursive function \`fib(n)\` that returns the nth Fibonacci number, where fib(0) = 0, fib(1) = 1, and fib(n) = fib(n-1) + fib(n-2) for n >= 2. Read N from input and print fib(N).
*Viết hàm đệ quy \`fib(n)\` trả về số Fibonacci thứ n, với fib(0) = 0, fib(1) = 1, và fib(n) = fib(n-1) + fib(n-2) với n >= 2. Đọc N từ input và in fib(N).*

**Example Input:**
\`\`\`
8
\`\`\`

**Example Output:**
\`\`\`
21
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Reverse a Number",
      content: `Write a recursive function that takes a non-negative integer N and prints its digits in reverse order, separated by spaces. For example, for 1234, output is '4 3 2 1'. You may use a helper recursive function. Do not convert the number to a string and reverse it.
*Viết hàm đệ quy nhận vào số nguyên không âm N và in ra các chữ số theo thứ tự ngược lại, cách nhau bởi dấu cách. Ví dụ: với 1234, output là '4 3 2 1'. Có thể dùng hàm đệ quy phụ. Không được chuyển số thành chuỗi rồi đảo ngược.*

**Example Input:**
\`\`\`
5089
\`\`\`

**Example Output:**
\`\`\`
9 8 0 5
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Greatest Common Divisor (GCD)",
      content: `Write a recursive function \`gcd(a, b)\` using the Euclidean algorithm: gcd(a, 0) = a, and gcd(a, b) = gcd(b, a % b). Read two positive integers a and b on separate lines and print gcd(a, b).
*Viết hàm đệ quy \`gcd(a, b)\` dùng thuật toán Euclid: gcd(a, 0) = a, và gcd(a, b) = gcd(b, a % b). Đọc hai số nguyên dương a và b trên các dòng riêng biệt và in gcd(a, b).*

**Example Input:**
\`\`\`
48
18
\`\`\`

**Example Output:**
\`\`\`
6
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Countdown",
      content: `Write a recursive function \`countdown(n)\` that prints the numbers from N down to 1, one per line, then prints 'Go!' on the last line. Read N from input. Do not use loops.
*Viết hàm đệ quy \`countdown(n)\` in ra các số từ N giảm dần xuống 1, mỗi số một dòng, rồi in 'Go!' ở dòng cuối. Đọc N từ input. Không dùng vòng lặp.*

**Example Input:**
\`\`\`
4
\`\`\`

**Example Output:**
\`\`\`
4
3
2
1
Go!
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Sum of a List",
      content: `Write a recursive function \`list_sum(nums)\` that returns the sum of all integers in a list. Read a list of integers separated by spaces on one line and print the sum. Do not use loops or the built-in sum().
*Viết hàm đệ quy \`list_sum(nums)\` trả về tổng tất cả các số nguyên trong một danh sách. Đọc một danh sách số nguyên cách nhau bởi dấu cách trên một dòng và in tổng. Không dùng vòng lặp hay hàm sum() có sẵn.*

**Example Input:**
\`\`\`
3 7 -2 10 5
\`\`\`

**Example Output:**
\`\`\`
23
\`\`\``,
      weight: 10,
    },
  ],
};
