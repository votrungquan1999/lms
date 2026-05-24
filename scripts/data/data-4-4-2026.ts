export default {
  courseId: "c98f8f96-916d-48e0-a67b-a161c2cf422c",
  test: {
    title: "Python Practice: Loops, Conditionals, and Lists",
    description:
      "Complete these 10 exercises (5 easy, 5 intermediate). You should only rely on basic concepts: input, lists, print, for, if, and while. Avoid built-in functions like sum(), min(), max(), or set().",
    showCorrectAnswerAfterSubmit: true,
    showGradeAfterSubmit: true,
  },
  questions: [
    // --- EASY LEVEL ---
    {
      type: "free_text",
      title: "Average of Positive Numbers",
      content: `Write a program that takes a list of integers separated by spaces. Calculate and print the average of ONLY the positive numbers. If there are no positive numbers, print 'No positive numbers'.
*Viết chương trình nhận vào một danh sách các số nguyên cách nhau bởi dấu cách. Tính và in ra trung bình cộng CỦA RIÊNG các số dương. Nếu không có số dương nào, in ra 'No positive numbers'.*

**Example Input:**
\`\`\`
-3 10 -5 20 30
\`\`\`

**Example Output:**
\`\`\`
Average: 20.0
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Separate Positive and Negative",
      content: `Read a list of integers separated by spaces. Print two lines: the first line contains all the positive numbers (separated by spaces), and the second line contains all the negative numbers. Skip any zeros.
*Đọc một danh sách các số nguyên cách nhau bởi dấu cách. In ra hai dòng: dòng đầu tiên chứa tất cả các số dương (cách nhau bởi dấu cách), và dòng thứ hai chứa tất cả các số âm. Bỏ qua các số 0.*

**Example Input:**
\`\`\`
5 -3 0 8 -7 2 -1
\`\`\`

**Example Output:**
\`\`\`
Positive: 5 8 2
Negative: -3 -7 -1
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Divisible by 2 OR 3",
      content: `Write a program that reads a list of numbers. Count and print how many numbers in the list are divisible by 2 OR divisible by 3.
*Viết chương trình đọc vào một danh sách các số. Đếm và in ra có bao nhiêu số trong danh sách chia hết cho 2 HOẶC chia hết cho 3.*

**Example Input:**
\`\`\`
10 13 9 7 12
\`\`\`

**Example Output:**
\`\`\`
Count: 3
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Find Second Largest",
      content: `Write a program that takes a list of numbers. Find and print the second largest number in the list. Assume the list has at least two numbers.
*Viết chương trình nhận vào một danh sách các số. Tìm và in ra số lớn thứ hai trong danh sách. Giả sử danh sách có ít nhất hai số.*

**Example Input:**
\`\`\`
15 42 8 42 23
\`\`\`

**Example Output:**
\`\`\`
Second largest: 23
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Remove Duplicates",
      content: `Read a list of integers separated by spaces. Print the list after removing any duplicate values, keeping only the first occurrence of each number.
*Đọc một danh sách các số nguyên cách nhau bởi dấu cách. In ra danh sách sau khi đã loại bỏ các giá trị trùng lặp, chỉ giữ lại lần xuất hiện đầu tiên của mỗi số.*

**Example Input:**
\`\`\`
3 5 3 7 5 9 3
\`\`\`

**Example Output:**
\`\`\`
3 5 7 9
\`\`\``,
      weight: 10,
    },

    // --- INTERMEDIATE LEVEL ---
    {
      type: "free_text",
      title: "Check Increasing Sequence",
      content: `Write a Python program that takes a list of numbers. Check if the numbers are in strictly increasing order (each number is strictly greater than the previous one). If they are, print 'Yes', otherwise print 'No'.
*Viết chương trình Python nhận vào một danh sách các số. Kiểm tra xem các số có theo thứ tự tăng dần nghiêm ngặt không (mỗi số phải lớn hơn số trước đó). Nếu đúng, in 'Yes', ngược lại in 'No'.*

**Example Input:**
\`\`\`
3 7 10 15 20
\`\`\`

**Example Output:**
\`\`\`
Increasing: Yes
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Interleave Two Lists",
      content: `Read two lists of integers from the user on two separate lines. Print a new list by interleaving elements from both lists one by one. If one list is longer, append its remaining elements at the end.
*Đọc hai danh sách các số nguyên từ người dùng trên hai dòng khác nhau. In ra một danh sách mới bằng cách xen kẽ lần lượt các phần tử từ cả hai danh sách. Nếu một danh sách dài hơn, nối các phần tử còn lại của nó vào cuối.*

**Example Input:**
\`\`\`
1 3 5
2 4 6 8
\`\`\`

**Example Output:**
\`\`\`
1 2 3 4 5 6 8
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Compress Consecutive Duplicates",
      content: `Read a list of numbers. Compress consecutive identical elements into a format (value, count) and print each group on a new line. For example, for input '1 1 2 2 2', output '1 x2' on line 1 and '2 x3' on line 2.
*Đọc một danh sách các số. Nén các phần tử giống nhau liên tiếp thành định dạng (giá trị, số lượng) và in mỗi nhóm trên một dòng mới. Ví dụ: với đầu vào '1 1 2 2 2', in ra '1 x2' ở dòng 1 và '2 x3' ở dòng 2.*

**Example Input:**
\`\`\`
1 1 1 2 2 3 3 3 3 1
\`\`\`

**Example Output:**
\`\`\`
1 x3
2 x2
3 x4
1 x1
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Find Pairs with Target Sum",
      content: `Read a list of integers on the first line, and a target sum K on the second line. Find and print all possible pairs of numbers in the list that add up to K. Format each output pair as 'A + B = K'.
*Đọc một danh sách các số nguyên ở dòng đầu tiên, và một tổng mục tiêu K ở dòng thứ hai. Tìm và in ra tất cả các cặp số có thể trong danh sách có tổng bằng K. Định dạng mỗi cặp đầu ra là 'A + B = K'.*

**Example Input:**
\`\`\`
2 7 4 5 3 1
6
\`\`\`

**Example Output:**
\`\`\`
2 + 4 = 6
5 + 1 = 6
3 + 3 = 6
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Number Staircase",
      content: `Ask the user to input a single number N. Print a number staircase where the first line is exactly one '1', the second line is two '2's, the third is three '3's, up to N. Use nested loops.
*Yêu cầu người dùng nhập một số N. In ra số bậc thang trong đó dòng đầu tiên là một số '1', dòng thứ hai là hai số '2', dòng thứ ba là ba số '3', cho đến N. Sử dụng các vòng lặp lồng nhau (nested loops).*

**Example Input:**
\`\`\`
5
\`\`\`

**Example Output:**
\`\`\`
1
22
333
4444
55555
\`\`\``,
      weight: 10,
    },
  ],
};
